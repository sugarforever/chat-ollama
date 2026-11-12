import { test, expect, type Page } from "@playwright/test";
import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embeddingServer } from "./fixtures/embedding-server";
let child: ChildProcess,
  base: string,
  dir: string,
  embedding: Awaited<ReturnType<typeof embeddingServer>>,
  model: ReturnType<typeof createServer>,
  modelUrl: string;
const modelRequests: string[] = [];
let sourceId = "",
  held: () => void = () => {};
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ui-"));
  embedding = await embeddingServer();
  model = createServer(async (req, res) => {
    let raw = "";
    for await (const p of req) raw += p;
    const body = JSON.parse(raw);
    const last =
      body.messages.findLast((m: any) => m.role === "user")?.content ?? "";
    modelRequests.push(String(last));
    if (String(last).includes("fail model")) {
      res.writeHead(503);
      res.end("fixture provider unavailable");
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (delta: any, finish_reason: any = null) =>
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    if (String(last).includes("hold")) {
      emit({ role: "assistant", content: "Persisted partial answer" });
      await new Promise<void>((r) => (held = r));
      if (res.destroyed) return;
      emit({ content: " completed" });
    } else if (
      String(last).includes("retrieve") &&
      !body.messages.some((m: any) => m.role === "tool")
    ) {
      emit({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "search",
            type: "function",
            function: {
              name: "search_knowledge",
              arguments: JSON.stringify({ query: "orchard" }),
            },
          },
        ],
      });
      emit({}, "tool_calls");
      res.end("data: [DONE]\n\n");
      return;
    } else if (String(last).includes("echo MCP") && !body.messages.some((m: any) => m.role === "tool")) {
      const tool = body.tools.find((t: any) => t.function.description.includes(": echo."));
      emit({ role: "assistant", tool_calls: [{ index: 0, id: "echo", type: "function", function: { name: tool.function.name, arguments: JSON.stringify({text: "MCP completed"}) } }] });
      emit({}, "tool_calls");
      res.end("data: [DONE]\n\n");
      return;
    } else if (String(last).includes("effect")) {
      const tool = body.tools.find((t: any) =>
        t.function.description.includes("effect"),
      );
      emit({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "effect",
            type: "function",
            function: { name: tool.function.name, arguments: "{}" },
          },
        ],
      });
      emit({}, "tool_calls");
      res.end("data: [DONE]\n\n");
      return;
    } else
      emit({
        role: "assistant",
        content: String(last) === "Help me plan a focused workday."
          ? "## A focused workday\nStart with one clear priority, then give it your best attention.\n\n- **Morning:** protect a 90-minute focus block.\n- **Afternoon:** group meetings and smaller tasks.\n- **Before you finish:** choose tomorrow’s first step."
          : String(last).startsWith("history ")
          ? "## Orchard answer\nI can continue with the conversation history."
          : `## Orchard answer\nApples grow here. [Notes](/sources/${sourceId}) [Invented](/sources/invented) [Unsafe](javascript:alert(1))\n<script>window.attacked=true</script>`,
      });
    emit({}, "stop");
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(model.address() as any).port}/v1`;
  await startServer();
});
test.afterAll(async () => {
  held();
  child?.kill("SIGKILL");
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await embedding.close();
  await rm(dir, { recursive: true, force: true });
});

async function startServer() {
  if (!base) {
    const portServer = createServer();
    await new Promise<void>((r) => portServer.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(portServer.address() as any).port}`;
    await new Promise<void>((r) => portServer.close(() => r()));
  }
  let stderr = "";
  child = fork("server.mjs", [], {
    execArgv: [],
    env: { ...process.env, DATA_DIR: dir, ADMIN_PASSWORD: "ui-password", HOST: "127.0.0.1", PORT: new URL(base).port, ORIGIN: base },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  child.stderr?.on("data", (data) => stderr += data);
  await expect.poll(async () => {
    if (child.exitCode !== null) throw Error(stderr);
    try { return (await fetch(base + "/login")).status; } catch { return 0; }
  }, {timeout: 20000}).toBe(200);
}
async function killServer() {
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill("SIGKILL");
  await exited;
}

async function login(page: Page) {
  await page.goto(base);
  await page.getByLabel("Password").fill("ui-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New conversation", exact: true }),
  ).toBeVisible();
}
async function request(
  page: Page,
  path: string,
  data?: unknown,
  method?: string,
) {
  return page.evaluate(
    async ({ path, data, method }) => {
      const r = await fetch(path, {
        method: method ?? (data === undefined ? "GET" : "POST"),
        headers: { "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return {
        status: r.status,
        value: r.status === 204 ? null : await r.json(),
      };
    },
    { path, data, method },
  );
}
async function configure(page: Page) {
  await request(page, "/api/settings", {
    chat: { baseUrl: modelUrl, modelId: "fixture", apiKey: "chat-secret" },
    embedding: embedding.config,
  });
}
async function create(page: Page, collection?: string, mcp?: string) {
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  if (collection) await page.getByLabel(collection, { exact: true }).check();
  if (mcp) await page.getByLabel(mcp, { exact: true }).check();
  const previousUrl = page.url();
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await expect(page).not.toHaveURL(previousUrl);
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
}
test("administrator opens responsive chat and independent secret-preserving settings", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.locator(".provider-row").first().click();
  await page.getByLabel("Default model ID").fill("fixture");
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Provider saved");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByRole("link", {name:"Embeddings",exact:true}).click();
  await expect(page.getByLabel("Embedding model ID")).toHaveValue(
    embedding.config.modelId,
  );
  await page.getByRole("link", {name:"MCP servers",exact:true}).click();
  await page
    .getByRole("button", { name: "Replace MCP configuration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save complete replacement" }),
  ).toBeDisabled();
  await page.getByLabel("Complete MCP configuration JSON").fill(
    JSON.stringify([
      {
        id: "saved-tools",
        transport: "http",
        url: "http://127.0.0.1:9/mcp",
        headers: { Authorization: "Bearer mcp-secret" },
      },
    ]),
  );
  await page
    .getByLabel("I intend to replace all servers and their secrets")
    .check();
  await page.getByRole("button", { name: "Save complete replacement" }).click();
  await expect(page.getByRole("status")).toContainText(
    "MCP configuration replaced",
  );
  expect(JSON.stringify((await request(page, "/api/mcp")).value)).not.toContain(
    "mcp-secret",
  );
  await page
    .getByRole("button", { name: "Replace MCP configuration", exact: true })
    .click();
  await page.getByLabel("Complete MCP configuration JSON").fill(
    JSON.stringify([
      {
        id: "saved-tools",
        transport: "http",
        url: "http://127.0.0.1:9/mcp",
        hasHeaders: true,
      },
    ]),
  );
  await page
    .getByLabel("I intend to replace all servers and their secrets")
    .check();
  await page.getByRole("button", { name: "Save complete replacement" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "not redacted presence flags",
  );
  expect((await request(page, "/api/mcp")).value.servers[0].hasHeaders).toBe(
    true,
  );
  await page.screenshot({
    path: "test-results/settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/settings-mobile.png",
    fullPage: true,
  });
});
test("upload indexing, scoped citations, expandable tools and hostile markdown", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", {name:"Knowledge",exact:true}).click();
  await page.getByLabel("Collection name").fill("Orchard");
  await page.getByRole("button", { name: "Add collection" }).click();
  const collection = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Orchard", exact: true }),
  });
  await collection.getByLabel("Upload document").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Apples grow in an orchard. 苹果在果园里生长。"),
  });
  await expect(collection.getByText("Ready · published")).toBeVisible();
  const all = (await request(page, "/api/knowledge-bases")).value;
  const c = all.find((c: any) => c.name === "Orchard");
  sourceId = (
    await request(page, `/api/knowledge-bases/${c.id}/search`, {
      query: "orchard",
    })
  ).value[0].sourceId;
  await page.getByRole("link", { name: "Back to chat", exact: false }).click();
  await create(page, "Orchard");
  await page.getByLabel("Message", { exact: true }).fill("retrieve orchard");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Orchard answer" }),
  ).toBeVisible();
  await page.locator("summary").click();
  await expect(page.locator("details")).toHaveAttribute("open", "");
  await expect(
    page.getByRole("link", { name: "Notes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Invented", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".transcript script")).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as any).attacked))).toBe(
    false,
  );
  expect((await request(page, `/api/sources/${sourceId}`)).status).toBe(404);
  expect((await request(page, `/sources/${sourceId}`)).status).toBe(404);
  expect(
    (
      await page.request.get(
        base +
          "/api/sources/%2e%2e%2f%2e%2e%2fetc%2fpasswd?conversationId=unknown",
      )
    ).status(),
  ).toBe(404);
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await expect(page.getByLabel("Source excerpt")).toContainText("苹果");
  const conv = (await request(page, "/api/conversations")).value.at(-1);
  const other = (
    await request(page, "/api/conversations", {
      modelId: "fixture",
      knowledgeBaseIds: [],
      mcpServerIds: [],
    })
  ).value;
  expect(
    (await request(page, `/api/sources/${sourceId}?conversationId=${other.id}`))
      .status,
  ).toBe(404);
  expect(
    (await request(page, `/api/sources/invented?conversationId=${conv.id}`))
      .status,
  ).toBe(404);
  await page.screenshot({
    path: "test-results/chat-source-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close source" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/chat-mobile.png",
    fullPage: true,
  });
  const docs = (await request(page, `/api/knowledge-bases/${c.id}/documents`))
    .value;
  await request(page, `/api/documents/${docs[0].id}`, undefined, "DELETE");
  expect(
    (await request(page, `/api/sources/${sourceId}?conversationId=${conv.id}`))
      .status,
  ).toBe(404);
});
test("busy input, persisted partial reconnect and explicit Stop", async ({
  page,
  context,
}) => {
  await login(page);
  await configure(page);
  await create(page);
  await page.getByLabel("Message", { exact: true }).fill("hold");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Persisted partial answer", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  await context.setOffline(true);
  await expect(
    page.getByText("Reconnecting — confirmed messages are saved"),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByText("Persisted partial answer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  held();
});
test("failed upload retry, rebuild warning and explicit reindex", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", {name:"Knowledge",exact:true}).click();
  await page.getByLabel("Collection name").fill("Retry notes");
  await page.getByRole("button", { name: "Add collection" }).click();
  const collection = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Retry notes", exact: true }),
  });
  embedding.fail(true);
  await collection.getByLabel("Upload document").setInputFiles({
    name: "retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("orchard retry"),
  });
  await expect(
    collection.getByRole("button", { name: "Retry document" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/indexing-failed.png",
    fullPage: true,
  });
  embedding.fail(false);
  await collection.getByRole("button", { name: "Retry document" }).click();
  await expect(collection.getByText("Ready · published")).toBeVisible();
  embedding.fail(true);
  await collection.getByRole("button", { name: "Reindex collection" }).click();
  await expect(collection.getByText(/Rebuild warning/)).toBeVisible();
  await expect(collection.getByText("Ready · published")).toBeVisible();
  embedding.fail(false);
  await page.getByRole("link", {name:"Embeddings",exact:true}).click();
  await page.getByLabel("Embedding model ID").fill("changed-fixture");
  await page.getByRole("button", { name: "Save embedding settings" }).click();
  await page.getByRole("link", {name:"Knowledge",exact:true}).click();
  await expect(
    collection.getByText("Reindex required", { exact: true }),
  ).toBeVisible();
  await collection.getByRole("button", { name: "Reindex collection" }).click();
  await expect(
    collection.getByText("Reindex required", { exact: true }),
  ).toHaveCount(0);
  await collection.getByRole("button", { name: "Delete document" }).click();
  await expect(collection.getByText("retry.txt")).toHaveCount(0);
  await collection.getByRole("button", { name: "Delete collection" }).click();
  await expect(
    page.getByRole("heading", { name: "Retry notes", exact: true }),
  ).toHaveCount(0);
});
test("selected MCP unsafe action requires deliberate uncertainty acknowledgment after Stop", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await request(
    page,
    "/api/mcp",
    {
      servers: [
        {
          id: "action-fixture",
          transport: "stdio",
          command: process.execPath,
          args: [
            "--import",
            "tsx",
            join(process.cwd(), "tests/fixtures/mcp-server.ts"),
          ],
          env: { EFFECT_FILE: join(dir, "effect.log") },
        },
      ],
    },
    "PUT",
  );
  await page.reload();
  await create(page, undefined, "action-fixture");
  await page.getByLabel("Message", { exact: true }).fill("effect");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator("summary")).toContainText("running");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByText("An external action has an uncertain outcome."),
  ).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  await page.locator("summary").click();
  await page.screenshot({
    path: "test-results/tool-uncertain-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "I checked the outcome — acknowledge" })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await expect(
    page.getByText("An external action has an uncertain outcome."),
  ).toHaveCount(0);
});
test("reloading an older selected conversation keeps that conversation", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await create(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("first conversation marker");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Orchard answer" }),
  ).toBeVisible();
  await create(page);
  const buttons = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button");
  await buttons.nth((await buttons.count()) - 2).click();
  await expect(
    page.getByText("first conversation marker", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("first conversation marker", { exact: true }),
  ).toBeVisible();
});

test("failed run shows an actionable status without exposing provider details", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await create(page);
  await page.getByLabel("Message", { exact: true }).fill("fail model");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(
      "Run failed. Check your provider authentication and model settings, then send a new message.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
});

// Delay real responses; the application and production server still execute normally.
async function delayResponse(page: Page, pattern: string) {
  let release!: () => void, captured!: () => void, fulfilled!: () => void;
  const delivered = new Promise<void>((r) => (fulfilled = r));
  const gate = new Promise<void>((r) => (release = r));
  const ready = new Promise<void>((r) => (captured = r));
  await page.route(
    pattern,
    async (route) => {
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
      fulfilled();
    },
    { times: 1 },
  );
  return { ready, release, delivered };
}
async function pair(page: Page) {
  await login(page);
  await configure(page);
  await create(page);
  const a = new URL(page.url()).searchParams.get("conversation")!;
  await create(page);
  const b = new URL(page.url()).searchParams.get("conversation")!;
  const buttons = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button");
  await buttons.nth((await buttons.count()) - 2).click();
  await expect(page).toHaveURL(new RegExp(a));
  return { a, b, buttons };
}
async function switchLast(page: Page) {
  const buttons = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button");
  await buttons.last().click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
}
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
test("delayed admission cannot clear a different conversation draft", async ({
  page,
}) => {
  const { a } = await pair(page);
  const delay = await delayResponse(page, `**/api/conversations/${a}/messages`);
  await page.getByLabel("Message", { exact: true }).fill("message in A");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await delay.ready;
  await switchLast(page);
  await page.getByLabel("Message", { exact: true }).fill("draft in B");
  const done = page.waitForResponse((r) => r.url().endsWith(`/${a}/messages`));
  delay.release();
  await done;
  await settle(page);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "draft in B",
  );
});
// A real GET captures running before SSE commits completion; network delivery is delayed.
// Removing same-conversation stream ordering must hide the answer and disable the composer.
test("delayed running GET cannot overwrite completed SSE state in the same conversation", async ({ page }) => {
  await login(page);
  await configure(page);
  await create(page);
  const id = new URL(page.url()).searchParams.get("conversation")!;
  let release!: () => void, captured!: () => void;
  let capturedStatus = "";
  const gate = new Promise<void>((r) => release = r);
  const ready = new Promise<void>((r) => captured = r);
  await page.route(`**/api/conversations/${id}`, async (route) => {
    const response = await route.fetch();
    capturedStatus = (await response.json()).status;
    captured();
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.getByLabel("Message", { exact: true }).fill("hold stale same conversation");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await ready;
    expect(capturedStatus).toBe("running");
    await expect(page.getByText("Persisted partial answer", { exact: true })).toBeVisible();
    held();
    await expect(page.getByText("Persisted partial answer completed", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
    const delivered = page.waitForResponse((r) => r.url().endsWith(`/conversations/${id}`));
    release();
    await delivered;
    await settle(page);
    await expect(page.getByText("Persisted partial answer completed", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  } finally {
    release();
    held();
  }
});
test("delayed Stop GET cannot overwrite a subsequent run's SSE state", async ({ page }) => {
  await login(page);
  await configure(page);
  await create(page);
  const id = new URL(page.url()).searchParams.get("conversation")!;
  await page.getByLabel("Message", { exact: true }).fill("hold first action run");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Persisted partial answer", { exact: true })).toBeVisible();
  const delay = await delayResponse(page, `**/api/conversations/${id}`);
  try {
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await delay.ready;
    await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
    await page.getByLabel("Message", { exact: true }).fill("hold subsequent action run");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
    await expect(page.getByText("Persisted partial answer", { exact: true })).toHaveCount(2);
    delay.release();
    await delay.delivered;
    await settle(page);
    await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  } finally {
    delay.release();
    held();
  }
});
test("delayed send snapshot cannot replace the selected conversation", async ({
  page,
}) => {
  const { a } = await pair(page);
  const delay = await delayResponse(page, `**/api/conversations/${a}`);
  await page.getByLabel("Message", { exact: true }).fill("stale A transcript");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await delay.ready;
  await switchLast(page);
  const done = page.waitForResponse((r) =>
    r.url().endsWith(`/conversations/${a}`),
  );
  delay.release();
  await done;
  await settle(page);
  await expect(
    page.getByText("stale A transcript", { exact: true }),
  ).toHaveCount(0);
});
test("delayed Stop snapshot cannot replace the selected conversation", async ({
  page,
}) => {
  const { a } = await pair(page);
  await page.getByLabel("Message", { exact: true }).fill("hold stale Stop A");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Persisted partial answer", { exact: true }),
  ).toBeVisible();
  const delay = await delayResponse(page, `**/api/conversations/${a}`);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await delay.ready;
  await switchLast(page);
  const done = page.waitForResponse((r) =>
    r.url().endsWith(`/conversations/${a}`),
  );
  delay.release();
  await done;
  await settle(page);
  held();
  await expect(
    page.getByText("hold stale Stop A", { exact: true }),
  ).toHaveCount(0);
});
for (const phase of ["catalogue", "settings", "snapshot"])
  test(`unmount during delayed ${phase} cannot open an orphan stream`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const Original = window.EventSource;
      (window as any).__streams = 0;
      window.EventSource = class extends Original {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          (window as any).__streams++;
        }
        close() {
          (window as any).__streams--;
          super.close();
        }
      };
    });
    await login(page);
    await configure(page);
    await create(page);
    const id = new URL(page.url()).searchParams.get("conversation")!;
    const path =
      phase === "catalogue"
        ? "/api/conversations"
        : phase === "settings"
          ? "/api/settings"
          : `/api/conversations/${id}`;
    const delay = await delayResponse(page, `**${path}`);
    await page.reload();
    await delay.ready;
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    const done = page.waitForResponse((r) => r.url().endsWith(path));
    delay.release();
    await done;
    await settle(page);
    expect(await page.evaluate(() => (window as any).__streams)).toBe(0);
  });
test("delayed source excerpt cannot open in a different conversation", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  const c = (
    await request(page, "/api/knowledge-bases", { name: "Delayed sources" })
  ).value;
  await page.request.post(base + `/api/knowledge-bases/${c.id}/documents`, {
    headers: { origin: base },
    multipart: {
      file: {
        name: "delayed.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("orchard delayed excerpt"),
      },
    },
  });
  await expect
    .poll(
      async () =>
        (await request(page, `/api/knowledge-bases/${c.id}/documents`)).value[0]
          .status,
    )
    .toBe("ready");
  sourceId = (
    await request(page, `/api/knowledge-bases/${c.id}/search`, {
      query: "orchard",
    })
  ).value[0].sourceId;
  await page.reload();
  await create(page, "Delayed sources");
  const a = new URL(page.url()).searchParams.get("conversation")!;
  await page
    .getByLabel("Message", { exact: true })
    .fill("retrieve delayed source");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Notes", exact: true }),
  ).toBeVisible();
  await create(page);
  const buttons = page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button");
  await buttons.nth((await buttons.count()) - 2).click();
  await expect(
    page.getByRole("link", { name: "Notes", exact: true }),
  ).toBeVisible();
  const delay = await delayResponse(
    page,
    `**/api/sources/${sourceId}?conversationId=${a}`,
  );
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await delay.ready;
  await switchLast(page);
  const done = page.waitForResponse((r) =>
    r.url().includes(`/api/sources/${sourceId}`),
  );
  delay.release();
  await done;
  await settle(page);
  await expect(page.getByLabel("Source excerpt")).toHaveCount(0);
});

test("SIGKILL resumes the admitted chat on the shipped entrypoint", async ({ page }) => {
  await login(page);
  await configure(page);
  await create(page);
  const id = new URL(page.url()).searchParams.get("conversation")!;
  const snapshot = async () => (await request(page, `/api/conversations/${id}`)).value;
  // Build a prior process revision higher than recovery's reset counter.
  for (let n = 0; n < 3; n++) {
    await request(page, `/api/conversations/${id}/messages`, {requestId: `warmup-${n}`, content: `warmup ${n}`});
    await expect.poll(async () => (await snapshot()).status).toBe("idle");
  }
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("hold crash recovery");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Persisted partial answer", { exact: true })).toBeVisible();
  const beforeRestart = Number((await snapshot()).revision);
  await killServer();
  await startServer();
  await expect(page.getByText("hold crash recovery", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", {name: "Stop", exact: true})).toBeVisible();
  await expect.poll(async () => {
    held();
    const current = await snapshot();
    return {
      status: current.status,
      answers: current.entries.filter((entry: any) => entry.kind === "assistant" && !entry.partial && entry.content === "Persisted partial answer completed").length,
    };
  }).toEqual({status: "idle", answers: 1});
  await expect(page.getByText("Persisted partial answer completed", { exact: true })).toBeVisible();
  const completed = await snapshot();
  expect(Number(completed.revision)).toBeLessThan(beforeRestart);
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  expect(completed.entries.filter((entry: any) => entry.kind === "user" && entry.content === "hold crash recovery")).toHaveLength(1);
  expect(modelRequests.filter(prompt => prompt === "hold crash recovery")).toHaveLength(2);
  await page.reload();
  await expect(page.getByText("Persisted partial answer completed", { exact: true })).toBeVisible();
  const persisted = await snapshot();
  expect(persisted.status).toBe("idle");
  expect(persisted.entries).toEqual(completed.entries);
  expect(modelRequests.filter(prompt => prompt === "hold crash recovery")).toHaveLength(2);
  await expect(page.getByText("hold crash recovery", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: "test-results/acceptance-chat-restarted.png", fullPage: true });
});

test("SIGKILL during embedding resumes indexing from the mounted data directory", async ({ page }) => {
  await login(page);
  await configure(page);
  const c = (await request(page, "/api/knowledge-bases", { name: "Crash indexing" })).value;
  const count = embedding.requests.length;
  embedding.hold(true);
  const uploaded = await page.request.post(base + `/api/knowledge-bases/${c.id}/documents`, {
    headers: { origin: base },
    multipart: { file: { name: "restart.md", mimeType: "text/markdown", buffer: Buffer.from("Apples orchard 苹果") } },
  });
  const document = await uploaded.json();
  await expect.poll(() => embedding.requests.length).toBeGreaterThan(count);
  await killServer();
  embedding.hold(false);
  await startServer();
  await expect.poll(async () => (await request(page, `/api/documents/${document.id}`)).value.status).toBe("ready");
  expect((await request(page, `/api/knowledge-bases/${c.id}/search`, {query: "苹果"})).value.length).toBeGreaterThan(0);
});

test("SIGKILL after external MCP effect preserves uncertainty without repeated dispatch", async ({ page }) => {
  await login(page);
  await configure(page);
  const effectFile = join(dir, "crash-effect.log");
  await request(page, "/api/mcp", { servers: [{ id: "crash-action", transport: "stdio", command: process.execPath,
    args: ["--import", "tsx", join(process.cwd(), "tests/fixtures/mcp-server.ts")], env: { EFFECT_FILE: effectFile } }] }, "PUT");
  await page.reload();
  await create(page, undefined, "crash-action");
  await page.getByLabel("Message", { exact: true }).fill("effect crash");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(async () => { try { return await readFile(effectFile, "utf8"); } catch { return ""; } }).toBe("effect\n");
  await killServer();
  await startServer();
  await page.reload();
  await expect(page.getByText("An external action has an uncertain outcome.")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
  expect(await readFile(effectFile, "utf8")).toBe("effect\n");
  await killServer();
  await startServer();
  await page.reload();
  await expect(page.getByText("An external action has an uncertain outcome.")).toBeVisible();
  expect(await readFile(effectFile, "utf8")).toBe("effect\n");
  await page.screenshot({ path: "test-results/acceptance-mcp-restarted.png", fullPage: true });
});


test("selected MCP tool completes through the shipped HTTP server", async ({page}) => {
  await login(page);
  await configure(page);
  await request(page, "/api/mcp", { servers: [{id: "echo-server", transport: "stdio", command: process.execPath,
    args: ["--import", "tsx", join(process.cwd(), "tests/fixtures/mcp-server.ts")] }] }, "PUT");
  await page.reload();
  await create(page, undefined, "echo-server");
  await page.getByLabel("Message", {exact: true}).fill("echo MCP");
  await page.getByRole("button", {name: "Send message", exact: true}).click();
  await expect(page.getByRole("heading", {name: "Orchard answer"})).toBeVisible();
  await page.locator("summary").click();
  await expect(page.locator("details")).toContainText("MCP completed");
  await expect(page.getByLabel("Message", {exact: true})).toBeEnabled();
});

// Catches forms that save only defaults, lose credentials, or create a new conversation on switch.
test("named providers can be saved in Settings and switched within a conversation", async ({ page }) => {
  await login(page);
  await configure(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Add provider", exact: true }).click();
  await page.getByRole("link", {name:"Custom provider",exact:true}).click();
  const card = page.getByRole("group", { name: "Provider New provider", exact: true });
  await card.getByLabel("Provider name", { exact: true }).fill("Second provider");
  const second = page.getByRole("group", { name: "Provider Second provider", exact: true });
  await second.getByLabel("Base URL", { exact: true }).fill(modelUrl);
  await second.getByLabel("Default model ID", { exact: true }).fill("second-model");
  await second.getByLabel("API key", { exact: true }).fill("second-private-key");
  await page.getByRole("button", { name: "Save provider", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Provider saved");
  await expect(second.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(second.getByLabel("API key", { exact: true })).toHaveAttribute("placeholder", "Key saved · leave blank to keep");
  await page.locator(".settings-content > section").first().screenshot({ path: "test-results/provider-settings.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Back to chat", exact: false }).click();
  await create(page);
  const id = new URL(page.url()).searchParams.get("conversation");
  await page.getByLabel("Message", { exact: true }).fill("history before switching");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orchard answer" })).toBeVisible();
  await page.getByRole("button",{name:"Change model",exact:true}).click();
  await page.getByLabel("Conversation provider", { exact: true }).selectOption({ label: "Second provider" });
  await page.getByLabel("Conversation model ID", { exact: true }).fill("second-selected-model");
  await page.getByRole("button", { name: "Apply to next message", exact: true }).click();
  await expect.poll(async () => (await request(page, `/api/conversations/${id}`)).value.selection.modelId).toBe("second-selected-model");
  await page.reload();
  await page.getByRole("button",{name:"Change model",exact:true}).click();
  await expect(page.getByLabel("Conversation model ID", { exact: true })).toHaveValue("second-selected-model");
  await expect(page.getByText("history before switching", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("conversation")).toBe(id);
  await page.getByLabel("Message", { exact: true }).fill("history after switching");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orchard answer" })).toHaveCount(2);
  await page.screenshot({ path: "test-results/provider-switch.png", fullPage: true });
});

// Verifies the real provider UI and official OAuth interaction without using a personal account.
test('native service presets, secret setup and Codex subscription login are distinct',async({page,context})=>{
 await context.route('https://auth.openai.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>OpenAI sign in</h1>'}));
 await login(page);await configure(page);
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByRole('link',{name:'Custom provider',exact:true}).click();
 let card=page.getByRole('group',{name:'Provider New provider',exact:true});
 await card.getByLabel('Provider name',{exact:true}).fill('Native account');
 card=page.getByRole('group',{name:'Provider Native account',exact:true});
 await card.getByLabel('Model service',{exact:true}).selectOption('anthropic');
 await expect(card.getByLabel('Base URL',{exact:true})).toHaveValue('https://api.anthropic.com');
 expect(await card.getByLabel('Default model ID',{exact:true}).locator('option').count()).toBeGreaterThan(5);
 await card.getByLabel('API key',{exact:true}).fill('native-ui-secret');
 await page.getByRole('button',{name:'Save provider',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Provider saved');
 await expect(card.getByLabel('API key',{exact:true})).toHaveValue('');
 expect(JSON.stringify((await request(page,'/api/settings')).value)).not.toContain('native-ui-secret');
 await expect(card.getByText('Credentials saved on the server.',{exact:false})).toBeVisible();
 await card.screenshot({path:'test-results/native-provider-api.png'});
 await expect(card.getByLabel('Model service',{exact:true})).toHaveCount(0);
 await expect(card.getByLabel('Provider name',{exact:true})).toHaveCount(0);
 await expect(card.getByLabel('Base URL',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Back to providers',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 card=page.getByRole('group',{name:'Provider OpenAI Codex',exact:true});
 await expect(card.getByLabel('Authentication',{exact:true})).toHaveValue('oauth');
 await expect(card.getByLabel('API key',{exact:true})).toHaveCount(0);
 await expect(card.getByLabel('Base URL',{exact:true})).toBeDisabled();
 // A failed save must not start login against the old server-side service.
 let loginRequests=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/providers/')&&r.url().endsWith('/auth'))loginRequests++;});
 await page.route('**/api/settings',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'Cannot save providers'}})}));
 await card.getByRole('button',{name:'Connect account',exact:true}).click();
 await expect(card.getByRole('alert')).toContainText('Cannot save providers');
 expect(loginRequests).toBe(0);
 await page.unroute('**/api/settings');
 // Connecting a new subscription must save its configuration before login.
 const popupReady=page.waitForEvent('popup');
 await card.getByRole('button',{name:'Connect account',exact:true}).click();
 const popup=await popupReady;
 await expect(popup).toHaveURL(/^https:\/\/auth\.openai\.com\//);
 await expect(card.getByRole('link',{name:'Open official login',exact:true})).toBeVisible();
 await expect(card.getByLabel('Select OpenAI Codex login method:',{exact:true})).toHaveCount(0);
 await card.screenshot({path:'test-results/codex-oauth-login.png'});
 await card.getByRole('button',{name:'Cancel login',exact:true}).click();
 await expect(card.getByRole('button',{name:'Connect account',exact:true})).toBeEnabled();

 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await card.screenshot({path:'test-results/provider-oauth-mobile.png'});
});

test('settings catalog selects subscription defaults and cancel discards only provider drafts', async({page})=>{
  await login(page); await configure(page);
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.screenshot({path:'test-results/settings-providers.png',fullPage:true});
  const before=(await request(page,'/api/settings')).value.providers.length;
  await page.getByRole('link',{name:'Add provider',exact:true}).click();
  await expect.poll(()=>page.locator('.vendor img').count()).toBeGreaterThan(40);
  await expect.poll(()=>page.locator('.vendor img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.screenshot({path:'test-results/settings-catalog.png',fullPage:true});
  await page.getByLabel('Find a vendor').fill('Codex');
  await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
  await expect(page.getByLabel('Model service',{exact:true})).toHaveValue('openai-codex');
  await expect(page.getByLabel('Authentication',{exact:true})).toHaveValue('oauth');
  await page.getByLabel('Provider name',{exact:true}).fill('Discard this draft');
  await page.getByRole('link',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await expect(page.getByRole('link',{name:/Discard this draft/})).toHaveCount(0);
  expect((await request(page,'/api/settings')).value.providers.length).toBe(before);
  await page.getByRole('link',{name:'Embeddings',exact:true}).click();
  await page.getByLabel('Embedding model ID').fill('saved-after-cancel');
  await page.getByRole('button',{name:'Save embedding settings'}).click();
  await expect(page.getByRole('status')).toContainText('Embedding settings saved');
  await page.getByRole('link',{name:'Providers',exact:true}).click();
  await page.getByRole('link',{name:'Embeddings',exact:true}).click();
  await expect(page.getByLabel('Embedding model ID')).toHaveValue('saved-after-cancel');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('link',{name:'Providers',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Log out',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/settings-mobile.png',fullPage:true});
});

test('connect account opens official login automatically and completes without another app action', async({page,context})=>{
 await page.addInitScript(()=>{
  const open=window.open.bind(window);
  window.open=(url,target,features)=>{(window as any).__authPopupFeatures=features;return open(url,target,features);};
 });
 await login(page);await configure(page);
 await context.route('https://auth.openai.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>OpenAI sign in</h1>'}));
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 let flow:any;let connected=false;const answers:string[]=[];
 await page.route('**/api/providers/*/auth',async route=>{
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(body.action==='start') flow={id:'browser-flow',status:'pending',events:[],prompt:{id:'method',type:'select',message:'Select OpenAI Codex login method:',options:[{id:'browser',label:'Browser login (default)'},{id:'device_code',label:'Device code login (headless)'}]}};
  if(body.action==='answer') {answers.push(body.value);flow={id:'browser-flow',status:'pending',events:[{type:'auth_url',url:'https://auth.openai.com/oauth/authorize?state=test',instructions:'A browser window should open. Complete login to finish.'}],prompt:{id:'manual',type:'manual_code',message:'Paste authorization code'}};}
  await route.fulfill({json:{connected,mode:'oauth',...(flow?{flow:connected?{...flow,status:'connected',events:[],prompt:undefined}:flow}:{})}});
 });
 const popupReady=page.waitForEvent('popup',{timeout:5000});
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 const popup=await popupReady;
 await expect(popup).toHaveURL('https://auth.openai.com/oauth/authorize?state=test');
 expect(answers).toEqual(['browser']);
 expect(await page.evaluate(()=>(window as any).__authPopupFeatures)).toMatch(/popup=yes/);
 expect(await popup.evaluate(()=>innerWidth)).toBeLessThanOrEqual(520);
 expect(await popup.evaluate(()=>innerHeight)).toBeLessThanOrEqual(720);
 expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
 await expect(page.getByLabel('Select OpenAI Codex login method:',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Paste authorization code',{exact:true})).not.toBeVisible();
 connected=true;
 await expect(page.getByText('Credentials saved on the server.',{exact:false})).toBeVisible();
 await expect(page.getByText('Account connected.',{exact:true})).toBeVisible();
 await page.getByRole('group',{name:'Provider OpenAI Codex',exact:true}).screenshot({path:'test-results/oauth-connected.png'});
 await expect(page.getByRole('button',{name:'Connect account',exact:true})).toBeEnabled();
});


test('blocked login windows retain an explicit official login fallback',async({page})=>{
 await page.addInitScript(()=>{window.open=()=>null;});
 await login(page);await configure(page);
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 let pending=false;
 await page.route('**/api/providers/*/auth',async route=>{
  if(route.request().method()==='POST')pending=true;
  await route.fulfill({json:{connected:false,mode:'oauth',...(pending?{flow:{id:'blocked-flow',status:'pending',events:[{type:'auth_url',url:'https://auth.openai.com/oauth/authorize?state=blocked'}]}}:{})}});
 });
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 await expect(page.getByText('The sign-in window could not be opened.',{exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open official login',exact:true})).toHaveAttribute('href','https://auth.openai.com/oauth/authorize?state=blocked');
});

test('cancelled automatic method responses cannot redirect a restarted login',async({page,context})=>{
 await login(page);await configure(page);
 await context.route('https://auth.openai.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>OpenAI sign in</h1>'}));
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 let starts=0;let phase='idle';let release!:()=>void;let captured!:()=>void;
 const held=new Promise<void>(r=>release=r);const ready=new Promise<void>(r=>captured=r);
 const method={id:'old',status:'pending',events:[],prompt:{id:'old-method',type:'select',message:'Select OpenAI Codex login method:',options:[{id:'browser',label:'Browser login (default)'}]}};
 const auth=(state:string)=>({id:state,status:'pending',events:[{type:'auth_url',url:`https://auth.openai.com/oauth/authorize?state=${state}`}]});
 await page.route('**/api/providers/*/auth',async route=>{
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  let flow:any;
  if(body.action==='start'){starts++;phase=starts===1?'method':'new';flow=starts===1?{id:'old',status:'pending',events:[]}:auth('new');}
  else if(body.action==='answer'){captured();await held;flow=auth('old');}
  else if(body.action==='cancel'){phase='cancelled';flow={id:'old',status:'cancelled',events:[]};}
  else flow=phase==='method'?method:phase==='new'?auth('new'):undefined;
  await route.fulfill({json:{connected:false,mode:'oauth',...(flow?{flow}:{})}});
 });
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 await ready;
 await page.getByRole('button',{name:'Cancel login',exact:true}).click();
 const popupReady=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 const popup=await popupReady;
 await expect(popup).toHaveURL('https://auth.openai.com/oauth/authorize?state=new');
 const returned=page.waitForResponse(r=>r.url().endsWith('/auth')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='answer');
 release();await returned;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(null))));
 await expect(page.getByRole('link',{name:'Open official login',exact:true})).toHaveAttribute('href','https://auth.openai.com/oauth/authorize?state=new');
 await expect(popup).toHaveURL('https://auth.openai.com/oauth/authorize?state=new');
});

test('automatic browser method selection retries a transient failure', async({page,context})=>{
 await login(page);await configure(page);
 await context.route('https://auth.openai.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>OpenAI sign in</h1>'}));
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 let flow:any;let connected=false;const answers:string[]=[];
 await page.route('**/api/providers/*/auth',async route=>{
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(body.action==='start') flow={id:'browser-flow',status:'pending',events:[],prompt:{id:'method',type:'select',message:'Select OpenAI Codex login method:',options:[{id:'browser',label:'Browser login (default)'},{id:'device_code',label:'Device code login (headless)'}]}};
  if(body.action==='answer') {answers.push(body.value);if(answers.length===1){await route.fulfill({status:503,json:{error:{message:'Temporary login interruption'}}});return;}flow={id:'browser-flow',status:'pending',events:[{type:'auth_url',url:'https://auth.openai.com/oauth/authorize?state=test',instructions:'A browser window should open. Complete login to finish.'}],prompt:{id:'manual',type:'manual_code',message:'Paste authorization code'}};}
  await route.fulfill({json:{connected,mode:'oauth',...(flow?{flow:connected?{...flow,status:'connected',events:[],prompt:undefined}:body.action==='start'?{...flow,prompt:undefined}:flow}:{})}});
 });
 const popupReady=page.waitForEvent('popup',{timeout:5000});
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 const popup=await popupReady;
 await expect(popup).toHaveURL('https://auth.openai.com/oauth/authorize?state=test');
 expect(answers).toEqual(['browser','browser']);
 expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
 await expect(page.getByLabel('Select OpenAI Codex login method:',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Paste authorization code',{exact:true})).not.toBeVisible();
 connected=true;
 await expect(page.getByText('Credentials saved on the server.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect account',exact:true})).toBeEnabled();
});


test('automatic browser method selection retries when start already contains a prompt', async({page,context})=>{
 await login(page);await configure(page);
 await context.route('https://auth.openai.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>OpenAI sign in</h1>'}));
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 let flow:any;let connected=false;const answers:string[]=[];
 await page.route('**/api/providers/*/auth',async route=>{
  const body=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(body.action==='start') flow={id:'browser-flow',status:'pending',events:[],prompt:{id:'method',type:'select',message:'Select OpenAI Codex login method:',options:[{id:'browser',label:'Browser login (default)'},{id:'device_code',label:'Device code login (headless)'}]}};
  if(body.action==='answer') {answers.push(body.value);if(answers.length===1){await route.fulfill({status:503,json:{error:{message:'Temporary login interruption'}}});return;}flow={id:'browser-flow',status:'pending',events:[{type:'auth_url',url:'https://auth.openai.com/oauth/authorize?state=test',instructions:'A browser window should open. Complete login to finish.'}],prompt:{id:'manual',type:'manual_code',message:'Paste authorization code'}};}
  await route.fulfill({json:{connected,mode:'oauth',...(flow?{flow:connected?{...flow,status:'connected',events:[],prompt:undefined}:flow}:{})}});
 });
 const popupReady=page.waitForEvent('popup',{timeout:5000});
 await page.getByRole('button',{name:'Connect account',exact:true}).click();
 const popup=await popupReady;
 await expect(popup).toHaveURL('https://auth.openai.com/oauth/authorize?state=test');
 expect(answers).toEqual(['browser','browser']);
 expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
 await expect(page.getByLabel('Select OpenAI Codex login method:',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Paste authorization code',{exact:true})).not.toBeVisible();
 connected=true;
 await expect(page.getByText('Credentials saved on the server.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect account',exact:true})).toBeEnabled();
});


test('login, empty workspace and missing pages share the workspace design',async({page})=>{
 await page.goto(`${base}/login`);
 await page.screenshot({path:'test-results/login-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/login-mobile.png',fullPage:true});
 await page.getByLabel('Password').fill('incorrect-password');
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Login failed');
 await page.route('**/api/conversations',r=>r.request().method()==='GET'?r.fulfill({json:[]}):r.continue());
 await page.getByLabel('Password').fill('ui-password');
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A place for your next idea.',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/workspace-empty-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'test-results/workspace-empty-desktop.png',fullPage:true});
 const response=await page.goto(`${base}/page-that-does-not-exist`);
 expect(response?.status()).toBe(404);
 await expect(page.getByRole('heading',{name:'This page isn’t here.',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/error-page.png',fullPage:true});
 await page.getByRole('link',{name:'Back to workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'New conversation',exact:true})).toBeVisible();
});

test('compact model controls preserve drafts and new conversation settings fit mobile',async({page})=>{
 await login(page);await configure(page);
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.screenshot({path:'test-results/new-conversation-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/new-conversation-mobile.png',fullPage:true});
 const previous=page.url();
 await page.getByRole('button',{name:'Create conversation',exact:true}).click();
 await expect(page).not.toHaveURL(previous);
 await page.getByLabel('Message',{exact:true}).fill('Help me plan a focused workday.');
 await expect(page.getByLabel('Conversation model ID',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Change model',exact:true}).click();
 await expect(page.getByLabel('Conversation model ID',{exact:true})).toBeVisible();
 await page.getByLabel('Conversation model ID',{exact:true}).focus();
 await page.keyboard.press('Escape');
 await expect(page.getByLabel('Conversation model ID',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Change model',exact:true})).toBeFocused();
 await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Help me plan a focused workday.');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A focused workday',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/chat-redesign-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'test-results/chat-redesign-desktop.png',fullPage:true});
 const saved=(await request(page,'/api/settings')).value;
 const renamed=await request(page,'/api/settings',{defaultProviderId:saved.defaultProviderId,providers:saved.providers.map(({hasApiKey,...provider}:any)=>({...provider,name:provider.id===saved.defaultProviderId?'P'.repeat(100):provider.name}))});
 expect(renamed.status).toBe(200);
 await page.setViewportSize({width:390,height:667});
 await page.reload();
 await expect(page.locator('.model-summary strong')).toHaveText('P'.repeat(100));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeInViewport();
});

test('returning to Settings synchronizes account status after the provider editor closes',async({page})=>{
 await login(page);await configure(page);
 await page.getByRole('link',{name:'Settings',exact:true}).click();
 await page.getByRole('link',{name:'Add provider',exact:true}).click();
 await page.getByLabel('Find a vendor').fill('Codex');
 await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
 await page.getByLabel('Provider name',{exact:true}).fill('Callback sync account');
 let connected=false;let latency=0;
 await page.route('**/api/providers/*/auth',async r=>{if(latency)await new Promise(resolve=>setTimeout(resolve,latency));await r.fulfill({json:{connected,mode:'oauth'}});});
 await page.getByRole('button',{name:'Save provider',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Provider saved');
 await page.getByRole('link',{name:'Back to providers',exact:true}).click();
 const row=page.locator('.provider-row').filter({hasText:'Callback sync account'});
 await expect(row).toContainText('Not connected');
 connected=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(row).toContainText('Connected',{timeout:1500});
 connected=false;
 await expect(row).toContainText('Not connected',{timeout:5000});
 latency=2300;connected=true;
 await expect(row).toContainText('Connected',{timeout:8000});
});

test('provider routes preserve browser history and protect unsaved drafts', async ({page, context}) => {
  await login(page); await configure(page);
  await page.goto(base + '/settings');
  await expect(page).toHaveURL(/\/settings\/providers$/);
  const count = (await request(page, '/api/settings')).value.providers.length;
  await page.getByRole('link', {name:'Add provider', exact:true}).click();
  await page.getByLabel('Find a vendor').fill('Codex');
  await page.locator('.vendor').filter({hasText:'OpenAI Codex'}).click();
  await expect(page.getByLabel('Authentication', {exact:true})).toHaveValue('oauth');
  const draftUrl = page.url();
  await expect(page.getByLabel('Default chat provider', {exact:true})).toHaveCount(0);
  await page.getByLabel('Provider name', {exact:true}).fill('Unsaved browser draft');
  await page.goBack();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({path:'test-results/provider-unsaved-dialog.png',fullPage:true});
  await page.getByRole('button', {name:'Keep editing', exact:true}).click();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel('Provider name', {exact:true})).toHaveValue('Unsaved browser draft');
  await page.goBack();
  await page.getByRole('button', {name:'Discard changes', exact:true}).click();
  await expect(page.getByLabel('Find a vendor')).toHaveValue('Codex');
  await page.goForward();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel('Provider name', {exact:true})).not.toHaveValue('Unsaved browser draft');
  await page.reload();
  await expect(page).toHaveURL(draftUrl);
  expect((await request(page, '/api/settings')).value.providers.length).toBe(count);
  await page.getByRole('link', {name:'Chat defaults', exact:true}).click();
  await expect(page.getByLabel('Default chat provider', {exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/settings-chat-defaults.png',fullPage:true});
  await page.getByRole('link', {name:'Providers', exact:true}).click();
  const href = await page.locator('.provider-row').first().getAttribute('href');
  const other = await context.newPage();
  await other.goto(base + href);
  await expect(other.getByLabel('Default model ID', {exact:true})).toBeVisible();
  await other.reload();
  await expect(other.getByLabel('Default model ID', {exact:true})).toBeVisible();
  await other.goto(base + '/settings/providers/does-not-exist');
  await expect(other.getByRole('link', {name:'Back to providers', exact:true})).toBeVisible();
  await other.close();
});

test('saving a connection preserves other tabs and the global chat default', async ({page}) => {
  await login(page); await configure(page);
  const initial = (await request(page, '/api/settings')).value;
  const id = initial.providers[0].id;
  await page.goto(base + '/settings/providers/' + encodeURIComponent(id));
  await page.getByLabel('Default model ID', {exact:true}).fill('edited-model');
  const added = {id:'other-tab-connection', name:'Other tab connection', baseUrl:modelUrl, modelId:'other-model'};
  const providers = initial.providers.filter((p:any)=>p.id!==added.id).map(({hasApiKey,...p}:any)=>p);
  await request(page, '/api/settings', {providers:[...providers, added], defaultProviderId:added.id});
  await page.getByRole('button', {name:'Save provider', exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Provider saved');
  const latest = (await request(page, '/api/settings')).value;
  expect(latest.defaultProviderId).toBe(added.id);
  expect(latest.providers.find((p:any)=>p.id===added.id).name).toBe(added.name);
  expect(latest.providers.find((p:any)=>p.id===id).modelId).toBe('edited-model');
});
