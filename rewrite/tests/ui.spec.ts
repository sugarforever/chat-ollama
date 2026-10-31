import { test, expect, type Page } from "@playwright/test";
import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embeddingServer } from "./fixtures/embedding-server";
let child: ChildProcess,
  base: string,
  dir: string,
  embedding: Awaited<ReturnType<typeof embeddingServer>>,
  model: ReturnType<typeof createServer>,
  modelUrl: string;
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
        content: `## Orchard answer\nApples grow here. [Notes](/sources/${sourceId}) [Invented](/sources/invented) [Unsafe](javascript:alert(1))\n<script>window.attacked=true</script>`,
      });
    emit({}, "stop");
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  modelUrl = `http://127.0.0.1:${(model.address() as any).port}/v1`;
  child = fork("tests/fixtures/http-child.ts", [], {
    execArgv: ["--import", "tsx"],
    env: { ...process.env, DATA_DIR: dir, ADMIN_PASSWORD: "ui-password" },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  base = await new Promise<string>((resolve, reject) => {
    child.once("message", (m: any) => resolve(`http://127.0.0.1:${m.port}`));
    child.once("exit", () => reject(Error("server exited")));
  });
});
test.afterAll(async () => {
  held();
  child?.kill("SIGKILL");
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  await embedding.close();
  await rm(dir, { recursive: true, force: true });
});
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
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
}
test("administrator opens responsive chat and independent secret-preserving settings", async ({
  page,
}) => {
  await login(page);
  await configure(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Models", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Chat model ID").fill("fixture");
  await page
    .getByRole("button", { name: "Save chat settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Chat settings saved");
  await expect(page.getByLabel("Embedding model ID")).toHaveValue(
    embedding.config.modelId,
  );
  await expect(page.getByLabel("Chat API key")).toHaveValue("");
  await page
    .getByRole("button", { name: "Replace MCP configuration", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save complete replacement" }),
  ).toBeDisabled();
  await page
    .getByLabel("Complete MCP configuration JSON")
    .fill(
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
  await page
    .getByLabel("Complete MCP configuration JSON")
    .fill(
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
  await page.getByLabel("Embedding model ID").fill("changed-fixture");
  await page.getByRole("button", { name: "Save embedding settings" }).click();
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
      "Run failed. Check your model settings, then send a new message.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
});
