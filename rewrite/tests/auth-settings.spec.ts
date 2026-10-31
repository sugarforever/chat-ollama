import { afterEach, beforeAll, expect, test } from "vitest";
import { execFileSync, fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { modelServer } from "./fixtures/model-server";
const cleanup: (() => Promise<unknown>)[] = [];
beforeAll(() => execFileSync("pnpm", ["build"], { stdio: "pipe" }), 120000);
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "auth-settings-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  async function start() {
    const proc = fork("tests/fixtures/http-child.ts", [], {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        DATA_DIR: dir,
        ADMIN_PASSWORD: "correct-password",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    proc.stderr?.on("data", (x) => (stderr += x));
    const port = await new Promise<number>((resolve, reject) => {
      proc.once("message", (m: any) => resolve(m.port));
      proc.once("exit", () => reject(Error(stderr)));
    });
    cleanup.push(async () => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
        await new Promise((r) => proc.once("exit", r));
      }
    });
    const base = `http://127.0.0.1:${port}`;
    let cookie = "";
    const request = (
      path: string,
      data?: unknown,
      origin = base,
      method?: string,
    ) =>
      fetch(base + path, {
        redirect: "manual",
        method: method ?? (data === undefined ? "GET" : "POST"),
        headers: { cookie, origin, "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    return {
      proc,
      request,
      async login(password = "correct-password") {
        const res = await request("/api/auth/login", { password });
        cookie = res.headers.get("set-cookie")?.split(";")[0] || "";
        return res;
      },
    };
  }
  return { start, dir };
}
// Removing the central gate would expose existing APIs, future sources, and pages.
test("central access gate, password validation, cookie flags, origin checks and logout", async () => {
  const { start, dir } = await setup();
  const app = await start();
  for (const path of [
    "/api/conversations",
    "/api/mcp",
    "/api/conversations/unknown/acknowledge",
    "/api/conversations/unknown/events",
    "/sources/future",
  ])
    expect((await app.request(path)).status).toBe(401);
  expect((await app.request("/")).status).toBe(303);
  expect((await app.login("wrong")).status).toBe(401);
  const login = await app.login();
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  expect(login.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
  expect((await app.request("/api/conversations")).status).toBe(200);
  expect(
    (await app.request("/api/settings", {}, "https://evil.test")).status,
  ).toBe(403);
  expect((await app.request("/api/auth/logout", {})).status).toBe(200);
  expect((await app.request("/api/conversations")).status).toBe(401);
  await app.login();
  const db = new DatabaseSync(join(dir, "app.sqlite"));
  db.exec("UPDATE admin_sessions SET expires=0");
  db.close();
  expect((await app.request("/api/conversations")).status).toBe(401);
});
test("failed logins are rate limited", async () => {
  const { start } = await setup();
  const app = await start();
  for (let i = 0; i < 5; i++)
    expect((await app.login("wrong")).status).toBe(401);
  expect((await app.login()).status).toBe(429);
});
// Real pi requests catch a settings-only implementation, key loss, or endpoint changes during a run.
test("settings persist redacted secrets and configure actual later model requests", async () => {
  const { start } = await setup();
  const a = await modelServer(),
    b = await modelServer({ failure: true });
  cleanup.push(
    () => a.close(),
    () => b.close(),
  );
  let app = await start();
  await app.login();
  const save = await app.request("/api/settings", {
    chat: { baseUrl: a.baseUrl, modelId: "fixture", apiKey: "private-key" },
    embedding: { baseUrl: b.baseUrl, modelId: "embed", apiKey: "embed-secret" },
  });
  expect(save.status).toBe(200);
  expect(await save.text()).not.toContain("private-key");
  expect(
    (
      await app.request("/api/settings", {
        chat: { baseUrl: "file:///tmp/no" },
      })
    ).status,
  ).toBe(400);
  app.proc.kill("SIGKILL");
  await new Promise((r) => app.proc.once("exit", r));
  app = await start();
  await app.login();
  const settings = await (await app.request("/api/settings")).json();
  expect(settings.chat).toEqual({
    baseUrl: a.baseUrl,
    modelId: "fixture",
    hasApiKey: true,
  });
  expect(JSON.stringify(settings)).not.toContain("embed-secret");
  const id = (
    await (
      await app.request("/api/conversations", {
        modelId: "fixture",
        knowledgeBaseIds: [],
        mcpServerIds: [],
      })
    ).json()
  ).id;
  await app.request(`/api/conversations/${id}/messages`, {
    requestId: "one",
    content: "hello",
  });
  for (let i = 0; i < 200 && a.requests.length === 0; i++)
    await new Promise((r) => setTimeout(r, 25));
  expect(a.requests[0].authorization).toBe("Bearer private-key");
  await app.request("/api/settings", { chat: { baseUrl: b.baseUrl } });
  expect(b.requests).toHaveLength(0);
  app.proc.kill("SIGKILL");
  await new Promise((r) => app.proc.once("exit", r));
  app = await start();
  await app.login();
  expect(b.requests).toHaveLength(0);
  a.release();
  for (let i = 0; i < 200; i++) {
    if (
      (await (await app.request(`/api/conversations/${id}`)).json()).status ===
      "idle"
    )
      break;
    await new Promise((r) => setTimeout(r, 25));
  }
  b.release();
  await app.request(`/api/conversations/${id}/messages`, {
    requestId: "two",
    content: "next",
  });
  for (let i = 0; i < 200 && b.requests.length === 0; i++)
    await new Promise((r) => setTimeout(r, 25));
  expect(b.requests[0].path).toBe("/custom/v1/chat/completions");
  expect(b.requests[0].authorization).toBe("Bearer private-key");
  for (let i = 0; i < 200; i++) {
    if (
      (await (await app.request(`/api/conversations/${id}`)).json()).status ===
      "failed"
    )
      break;
    await new Promise((r) => setTimeout(r, 25));
  }
  await app.request("/api/settings", { chat: { baseUrl: a.baseUrl } });
  const before = a.requests.length;
  await app.request(`/api/conversations/${id}/messages`, {
    requestId: "after-failure",
    content: "retry with changed provider",
  });
  for (let i = 0; i < 200 && a.requests.length === before; i++)
    await new Promise((r) => setTimeout(r, 25));
  expect(a.requests.length).toBeGreaterThan(before);
});

test("MCP settings and acknowledgement require login and keep credentials on the server", async () => {
  const { start, dir } = await setup();
  const app = await start();
  expect(
    (await app.request("/api/conversations/unknown/acknowledge", {})).status,
  ).toBe(401);
  await app.login();
  const saved = await app.request(
    "/api/mcp",
    {
      servers: [
        {
          id: "remote",
          transport: "http",
          url: "http://127.0.0.1:1/mcp",
          headers: { Authorization: "Bearer mcp-private-secret" },
        },
      ],
    },
    undefined,
    "PUT",
  );
  expect(saved.status).toBe(200);
  expect(await saved.text()).not.toContain("mcp-private-secret");
  expect(await (await app.request("/api/mcp")).text()).not.toContain(
    "mcp-private-secret",
  );
  const failed = await app.request("/api/conversations", {
    modelId: "fixture",
    mcpServerIds: ["remote"],
    knowledgeBaseIds: [],
  });
  expect(failed.status).toBe(502);
  expect(await failed.text()).toContain("authentication");
  const response = await app.request("/api/conversations", {
    modelId: "fixture",
    mcpServerIds: [],
    knowledgeBaseIds: [],
  });
  const { id } = await response.json();
  const { openMcpBarrier } = await import("../src/lib/server/mcp/barrier");
  const barrier = openMcpBarrier(
    join(dir, "sessions", `${id}.sqlite.mcp.sqlite`),
  );
  try {
    barrier.begin("external action", "test");
    barrier.fail();
    expect(
      (
        await app.request(`/api/conversations/${id}/messages`, {
          requestId: "blocked",
          content: "continue",
        })
      ).status,
    ).toBe(409);
    const state = await app.request(`/api/conversations/${id}`);
    expect((await state.json()).mcpUncertainty).toContain("may have completed");
    expect(
      (await app.request(`/api/conversations/${id}/acknowledge`, {})).status,
    ).toBe(200);
    expect(barrier.uncertainty()).toBeUndefined();
  } finally {
    barrier.close();
  }
});

test("MCP discovery failure and removal leave built HTTP settings available after restart", async () => {
  const { start } = await setup();
  let app = await start();
  await app.login();
  await app.request(
    "/api/mcp",
    {
      servers: [
        {
          id: "broken",
          transport: "stdio",
          command: process.execPath,
          args: [
            "--import",
            "tsx",
            new URL("./fixtures/mcp-server.ts", import.meta.url).pathname,
          ],
          env: { FAIL_LIST: "1" },
        },
      ],
    },
    undefined,
    "PUT",
  );
  const failed = await app.request("/api/conversations", {
    modelId: "fixture",
    knowledgeBaseIds: [],
    mcpServerIds: ["broken"],
  });
  expect(failed.status).toBe(502);
  const error = await failed.text();
  expect(error).toContain("authentication");
  expect(error).not.toContain("discovery-private-secret");
  const [{ id }] = await (await app.request("/api/conversations")).json();
  app.proc.kill("SIGKILL");
  await new Promise((r) => app.proc.once("exit", r));
  app = await start();
  await app.login();
  expect((await app.request("/api/settings")).status).toBe(200);
  await app.request("/api/mcp", { servers: [] }, undefined, "PUT");
  app.proc.kill("SIGKILL");
  await new Promise((r) => app.proc.once("exit", r));
  app = await start();
  await app.login();
  expect((await app.request("/api/settings")).status).toBe(200);
  expect((await app.request(`/api/conversations/${id}`)).status).toBe(502);
});
