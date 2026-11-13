import { _electron, expect } from "@playwright/test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { embeddingServer } from "../tests/fixtures/embedding-server.ts";

// Exercise the installed resources, not the development server or system Node.
const sourceExecutable = resolve(
  process.argv[2] ||
    `release/${process.arch === "arm64" ? "mac-arm64" : "mac"}/ChatOllama.app/Contents/MacOS/ChatOllama`,
);
// Run outside the checkout so missing resources cannot fall back to its
// node_modules. Spaces in both installation and data paths are intentional.
const directory = await mkdtemp(join(tmpdir(), "ChatOllama desktop smoke "));
const relocated = join(directory, "Relocated ChatOllama.app");
await cp(resolve(dirname(sourceExecutable), "../.."), relocated, {
  recursive: true,
  verbatimSymlinks: true,
});
const executablePath = join(relocated, "Contents/MacOS/ChatOllama");
const bundledNode = join(
  dirname(executablePath),
  "../Resources/runtime/bin/node",
);
const embedding = await embeddingServer();
const model = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const last =
    body.messages.findLast((message) => message.role === "user")?.content || "";
  response.writeHead(200, { "content-type": "text/event-stream" });
  const emit = (delta, finish_reason = null) =>
    response.write(
      `data: ${JSON.stringify({
        id: "desktop",
        object: "chat.completion.chunk",
        created: 1,
        model: "fixture",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`,
    );
  if (String(last).includes("hold")) {
    emit({ role: "assistant", content: "Desktop streaming partial" });
    return; // The UI must Stop this real streaming request.
  }
  if (
    String(last).includes("tools") &&
    !body.messages.some((message) => message.role === "tool")
  ) {
    const echo = body.tools.find((tool) =>
      tool.function.description.includes(": echo."),
    );
    emit({
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "knowledge",
          type: "function",
          function: {
            name: "search_knowledge",
            arguments: '{"query":"orchard"}',
          },
        },
        {
          index: 1,
          id: "mcp",
          type: "function",
          function: {
            name: echo.function.name,
            arguments: '{"text":"Desktop MCP result"}',
          },
        },
      ],
    });
    emit({}, "tool_calls");
  } else {
    const results = body.messages
      .filter((message) => message.role === "tool")
      .map((message) => message.content)
      .join(" ");
    emit({
      role: "assistant",
      content: results
        ? `Desktop tools complete: ${results}`
        : "Desktop answer",
    });
    emit({}, "stop");
  }
  response.end("data: [DONE]\n\n");
});
await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
const env = {
  ...process.env,
  CHATOLLAMA_DATA_DIR: directory,
  CHAT_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
  CHAT_MODEL_ID: "fixture",
};
let app;
async function launch() {
  app = await _electron.launch({ executablePath, env, timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
}
async function request(
  page,
  path,
  data,
  method = data === undefined ? "GET" : "POST",
) {
  return page.evaluate(
    async ({ path, data, method }) => {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      if (!response.ok)
        throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response.status === 204 ? null : response.json();
    },
    { path, data, method },
  );
}
try {
  let page = await launch();
  await expect(
    page.getByRole("button", { name: "New conversation", exact: true }),
  ).toBeVisible();
  // Reopening the installed application must also restore a closed macOS window.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  const reopened = app.waitForEvent("window", { timeout: 10000 });
  void reopened.catch(() => {});
  const duplicate = spawn(executablePath, [], { env, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      duplicate.kill("SIGKILL");
      reject(new Error("Second instance did not exit"));
    }, 10000);
    duplicate.once("error", reject);
    duplicate.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error(`Second instance exited ${code}`));
    });
  });
  page = await reopened;
  await page.waitForLoadState("domcontentloaded");
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
  ).toBe(1);
  await request(page, "/api/settings", { embedding: embedding.config });
  const collection = await request(page, "/api/knowledge-bases", {
    name: "Desktop orchard",
  });
  await page.evaluate(async (id) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["Apples grow in an orchard."]),
      "orchard.txt",
    );
    const response = await fetch(`/api/knowledge-bases/${id}/documents`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error(`Upload: ${response.status}`);
  }, collection.id);
  await expect
    .poll(
      async () => {
        const documents = await request(
          page,
          `/api/knowledge-bases/${collection.id}/documents`,
        );
        return documents[0]?.status;
      },
      { timeout: 15000 },
    )
    .toBe("ready");
  await request(
    page,
    "/api/mcp",
    {
      servers: [
        {
          id: "desktop-fixture",
          transport: "stdio",
          command: bundledNode,
          args: [resolve("tests/fixtures/mcp-server.ts")],
        },
      ],
    },
    "PUT",
  );
  const conversation = await request(page, "/api/conversations", {
    modelId: "fixture",
    knowledgeBaseIds: [collection.id],
    mcpServerIds: ["desktop-fixture"],
  });
  await page.goto(
    `${new URL(page.url()).origin}/?conversation=${conversation.id}`,
  );
  await page.getByLabel("Message", { exact: true }).fill("Use tools");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText(/Desktop tools complete:/).last()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText(/Desktop tools complete:/).last()).toContainText(
    "Desktop MCP result",
  );
  await expect(page.getByText(/Desktop tools complete:/).last()).toContainText(
    "orchard",
  );
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await page.getByLabel("Message", { exact: true }).fill("hold");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Desktop streaming partial", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/desktop-smoke.png" });
  const firstOrigin = new URL(page.url()).origin;
  await app.close();
  app = undefined;
  page = await launch();
  const conversations = await request(page, "/api/conversations");
  expect(conversations.some((item) => item.id === conversation.id)).toBe(true);
  expect(await request(page, "/api/knowledge-bases")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Desktop orchard" }),
    ]),
  );
  await page.goto(
    `${new URL(page.url()).origin}/?conversation=${conversation.id}`,
  );
  await expect(page.getByText(/Desktop tools complete:/).last()).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  console.log(
    `Packaged desktop smoke passed (${process.arch}): UI, single instance, authenticated API, knowledge, stdio MCP via bundled Node, chat streaming, Stop and restart persistence. Initial origin: ${firstOrigin}`,
  );
} finally {
  await app?.close();
  model.closeAllConnections();
  await new Promise((resolve) => model.close(resolve));
  await embedding.close();
  await rm(directory, { recursive: true, force: true });
}
