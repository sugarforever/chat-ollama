import { test, expect } from "vitest";
import { fork } from "node:child_process";
import { connectServer } from "../src/lib/server/mcp/client";
import { stableToolName } from "../src/lib/server/mcp/tools";
const fixture = new URL("./fixtures/mcp-server.ts", import.meta.url).pathname;
for (const transport of ["stdio", "http"] as const)
  test(`${transport}: discovers, translates and cleans up real MCP`, async () => {
    let child: ReturnType<typeof fork> | undefined;
    let config: any = {
      id: "fixture",
      transport: "stdio",
      command: process.execPath,
      args: ["--import", "tsx", fixture],
    };
    if (transport === "http") {
      child = fork(fixture, [], {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, MCP_HTTP: "1" },
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      });
      const url = await new Promise<string>((resolve) =>
        child!.once("message", (m: any) => resolve(m.url)),
      );
      config = { id: "fixture", transport: "http", url };
    }
    try {
      const c = await connectServer(config);
      expect((await c.listTools())[0].name).toBe("echo");
      expect(await c.callTool("echo", { text: "中文" })).toMatchObject({
        content: [{ type: "text", text: "中文" }],
      });
      await c.close();
      await expect(c.callTool("echo", { text: "x" })).rejects.toThrow();
    } finally {
      child?.kill("SIGKILL");
    }
  });
test("stable names distinguish ambiguous server/tool pairs", () => {
  expect(stableToolName("a-b", "c")).not.toBe(stableToolName("a", "b-c"));
  expect(stableToolName("a", "b")).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
});

import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionManager } from "../src/lib/server/runtime/manager";
import { createServer } from "node:http";
test("SIGKILL leaves one external effect and blocks resumed model MCP calls until explicit acknowledgement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-crash-"));
  const effect = join(directory, "effect");
  const tool = stableToolName("fixture", "effect");
  let requests = 0;
  let answer = false;
  const model = createServer(async (req, res) => {
    for await (const _ of req) {
    }
    requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const delta = answer
      ? { role: "assistant", content: "Acknowledged follow-up" }
      : {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call-${requests}`,
              type: "function",
              function: { name: tool, arguments: "{}" },
            },
          ],
        };
    res.end(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason: answer ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${(model.address() as any).port}/v1`;
  const config = {
    id: "fixture",
    transport: "stdio",
    command: process.execPath,
    args: ["--import", "tsx", fixture],
    env: { EFFECT_FILE: effect },
  };
  const child = fork(
    new URL("./fixtures/mcp-runtime-child.ts", import.meta.url),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        DATA_DIR: directory,
        BASE_URL: baseUrl,
        MCP_CONFIG: JSON.stringify(config),
      },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("message", () => resolve());
      child.once("exit", () => reject(Error("runtime exited before ready")));
    });
    child.send({ command: "submit" });
    await expect.poll(() => existsSync(effect), { timeout: 10000 }).toBe(true);
    child.kill("SIGKILL");
    await new Promise((r) => child.once("exit", r));
    const originalRequests = requests;
    const manager = createSessionManager({
      directory,
      endpoint: { baseUrl, apiKey: "x", modelId: "fixture" },
      mcpConfigs: [config] as any,
    });
    try {
      await manager.resume();
      const session = await manager.openSession("crash");
      await expect
        .poll(async () => (await session.snapshot()).status, { timeout: 10000 })
        .toBe("interrupted");
      expect(readFileSync(effect, "utf8")).toBe("effect\n");
      expect(requests).toBe(originalRequests);
      expect((await session.snapshot()).mcpUncertainty).toContain(
        "may have completed",
      );
      await expect(session.submit("blocked", "continue")).rejects.toThrow(
        /acknowledge/i,
      );
      await expect
        .poll(
          async () => {
            try {
              await session.acknowledgeInterruption();
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 10000 },
        )
        .toBe(true);
      expect((await session.snapshot()).mcpUncertainty).toBeUndefined();
      expect(
        (await session.snapshot()).entries.some(
          (entry) => entry.kind === "tool" && entry.uncertain,
        ),
      ).toBe(true);
      answer = true;
      await session.submit("later", "continue");
      await expect
        .poll(async () => (await session.snapshot()).status)
        .toBe("idle");
      expect(requests).toBe(originalRequests + 1);
    } finally {
      await manager.close();
    }
  } finally {
    child.kill("SIGKILL");
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
  }
}, 25000);
import {
  saveMcpServers,
  loadMcpServers,
  publicMcpServers,
} from "../src/lib/server/mcp/config";
import { createMcpTools } from "../src/lib/server/mcp/tools";
test("SQLite settings persist and redact server-only secrets; selected isolation and unsafe tools", async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mcp-settings-"));
  try {
    saveMcpServers([
      {
        id: "selected",
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
        env: { SECRET: "sentinel-mcp-secret" },
      },
      {
        id: "ignored",
        transport: "http",
        url: "http://127.0.0.1:1",
        headers: { Authorization: "Bearer sentinel-mcp-secret" },
      },
    ]);
    expect(loadMcpServers()).toHaveLength(2);
    expect(JSON.stringify(publicMcpServers())).not.toContain(
      "sentinel-mcp-secret",
    );
    const tools = await createMcpTools(["selected"], loadMcpServers(), {
      begin() {},
      complete() {},
      fail() {},
    });
    try {
      expect(tools.tools).toHaveLength(2);
      expect(
        await tools.tools[0].execute(
          { text: "translated" },
          { callId: "unit" } as any,
          {} as any,
        ),
      ).toMatchObject({
        output: [{ type: "text", text: expect.stringContaining("translated") }],
      });
      expect(tools.tools.every((t) => t.replay === "unsafe")).toBe(true);
    } finally {
      await tools.close();
    }
  } finally {
    delete process.env.DATA_DIR;
  }
});
test("connection loss reports uncertainty and prevents a second dispatch", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-lost-"));
  const effect = join(directory, "effect");
  const { openMcpBarrier } = await import("../src/lib/server/mcp/barrier");
  const barrier = openMcpBarrier(join(directory, "barrier.sqlite"));
  const bundle = await createMcpTools(
    ["lost"],
    [
      {
        id: "lost",
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
        env: { EFFECT_FILE: effect, LOSE_CONNECTION: "1" },
      },
    ],
    barrier,
  );
  try {
    const tool = bundle.tools.find(
      (t) => t.name === stableToolName("lost", "effect"),
    )!;
    await expect(
      tool.execute({}, { callId: "lost" } as any, {} as any),
    ).rejects.toThrow(/uncertain/);
    expect(barrier.uncertainty()).toContain("may have completed");
    await expect(
      tool.execute({}, { callId: "second" } as any, {} as any),
    ).rejects.toThrow(/Acknowledge/);
    expect(readFileSync(effect, "utf8")).toBe("effect\n");
  } finally {
    await bundle.close();
    barrier.close();
  }
});
test("each new input refreshes selected server config while a run keeps its saved snapshot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-refresh-"));
  let requests = 0;
  const model = createServer(async (req, res) => {
    for await (const _ of req) {
    }
    requests++;
    const delta =
      requests % 2
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `echo-${requests}`,
                type: "function",
                function: {
                  name: stableToolName("echo", "echo"),
                  arguments: '{"text":"value"}',
                },
              },
            ],
          }
        : { role: "assistant", content: "done" };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason: requests % 2 ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  let createdFor: string[] = [];
  let prefix = "A";
  const loadMcpConfigs = () => [
    {
      id: "echo",
      transport: "stdio" as const,
      command: process.execPath,
      args: ["--import", "tsx", fixture],
      env: { ECHO_PREFIX: prefix },
    },
  ];
  const manager = createSessionManager({
    directory,
    endpoint: {
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      apiKey: "x",
      modelId: "fixture",
    },
    loadMcpConfigs,
    createTools: (config: any) => {
      createdFor = config.knowledgeBaseIds;
      return [];
    },
  } as any);
  try {
    const { id } = await manager.createConversation({
      modelId: "fixture",
      mcpServerIds: ["echo"],
      knowledgeBaseIds: ["kb"],
    });
    const session = await manager.getSession(id);
    expect(createdFor).toEqual(["kb"]);
    await session.submit("a", "first");
    await expect
      .poll(async () => (await session.snapshot()).status)
      .toBe("idle");
    expect(
      (await session.snapshot()).entries.filter((e) => e.kind === "tool")[0]
        .content,
    ).toContain("Avalue");
    prefix = "B";
    await session.submit("b", "second");
    await expect
      .poll(async () => (await session.snapshot()).status)
      .toBe("idle");
    expect(
      (await session.snapshot()).entries.filter((e) => e.kind === "tool")[1]
        .content,
    ).toContain("Bvalue");
  } finally {
    await manager.close();
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
  }
});
test("cached discovery lets recovery register unsafe tools while a selected server is offline", async () => {
  const guard = { begin() {}, complete() {}, fail() {} };
  const bundle = await createMcpTools(
    ["cache"],
    [
      {
        id: "cache",
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
      },
    ],
    guard,
  );
  const descriptors = (bundle as any).descriptors;
  await bundle.close();
  const recovered = await (createMcpTools as any)(
    ["cache"],
    [{ id: "cache", transport: "http", url: "http://127.0.0.1:1" }],
    guard,
    descriptors,
  );
  try {
    expect(recovered.tools).toHaveLength(2);
  } finally {
    await recovered.close();
  }
});
test("returned results release the barrier only after the matching pi result commit; restart keeps the crash gap uncertain", async () => {
  const { openMcpBarrier } = await import("../src/lib/server/mcp/barrier");
  const file = join(mkdtempSync(join(tmpdir(), "mcp-gap-")), "barrier.sqlite");
  let barrier = openMcpBarrier(file);
  barrier.begin("echo", "call");
  barrier.complete();
  barrier.committed(["different"]);
  expect(() => barrier.begin("second", "two")).toThrow(/Acknowledge/);
  barrier.committed(["call"]);
  expect(() => barrier.begin("next", "three")).not.toThrow();
  barrier.complete();
  barrier.close();
  barrier = openMcpBarrier(file);
  try {
    expect(barrier.uncertainty()).toContain("may have completed");
    barrier.committed(["three"]);
    expect(barrier.uncertainty()).toBeDefined();
    barrier.acknowledge();
    expect(() => barrier.begin("allowed", "four")).not.toThrow();
  } finally {
    barrier.close();
  }
});
test("Stop cancellation reaches a held MCP request and preserves uncertainty", async () => {
  const effect = join(mkdtempSync(join(tmpdir(), "mcp-stop-")), "effect");
  const controller = new AbortController();
  const { openMcpBarrier } = await import("../src/lib/server/mcp/barrier");
  const barrier = openMcpBarrier(effect + ".sqlite");
  const bundle = await createMcpTools(
    ["stop"],
    [
      {
        id: "stop",
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", fixture],
        env: { EFFECT_FILE: effect },
      },
    ],
    barrier,
  );
  try {
    const tool = bundle.tools.find(
      (t) => t.name === stableToolName("stop", "effect"),
    )!;
    const execution = tool
      .execute(
        {},
        { callId: "stop" } as any,
        { abortSignal: controller.signal } as any,
      )
      .then(
        () => "success",
        (e) => String(e),
      );
    await expect.poll(() => existsSync(effect)).toBe(true);
    controller.abort();
    expect(
      await Promise.race([
        execution,
        new Promise((r) => setTimeout(() => r("timeout"), 300)),
      ]),
    ).toMatch(/uncertain/);
    expect(barrier.uncertainty()).toBeDefined();
  } finally {
    await bundle.close();
    barrier.close();
  }
});
test("an unavailable selected server does not prevent startup or repairing global configuration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-unavailable-"));
  const manager = createSessionManager({
    directory,
    endpoint: {
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: "x",
      modelId: "fixture",
    },
    loadMcpConfigs: () => [
      { id: "offline", transport: "http", url: "http://127.0.0.1:1/mcp" },
    ],
  });
  try {
    await expect(
      manager.createConversation({
        modelId: "fixture",
        knowledgeBaseIds: [],
        mcpServerIds: ["offline"],
      }),
    ).rejects.toThrow(/authentication/);
    await expect(manager.resume()).resolves.toBeUndefined();
  } finally {
    await manager.close();
  }
});
