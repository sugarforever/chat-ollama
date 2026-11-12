import { afterEach, expect, test } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionManager } from "../src/lib/server/runtime/manager";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});

test("every conversation offers and executes native coding tools in a persistent workspace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-tools-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const requests: any[] = [];
  const calls = [
    ["write", { path: "note.txt", content: "before" }],
    ["edit", { path: "note.txt", oldText: "before", newText: "after" }],
    ["read", { path: "note.txt" }],
    ["bash", { command: "cat note.txt" }],
  ] as const;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    const call = calls[requests.length - 1];
    res.writeHead(200, { "content-type": "text/event-stream" });
    const delta = call
      ? { role: "assistant", tool_calls: [{ index: 0, id: `call-${requests.length}`, type: "function", function: { name: call[0], arguments: JSON.stringify(call[1]) } }] }
      : { role: "assistant", content: "Done" };
    for (const [value, reason] of [[delta, null], [{}, call ? "tool_calls" : "stop"]])
      res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); });
  const endpoint = { baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, apiKey: "test", modelId: "fixture" };
  let manager = createSessionManager({ directory, endpoint, loadMcpConfigs: () => [] });
  cleanups.push(() => manager.close());
  const session = await manager.openSession("one");
  await session.submit("native-1", "Write, edit, read, and cat note.txt");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect((requests[0].tools ?? []).map((tool: any) => tool.function.name).sort()).toEqual(["bash", "edit", "read", "write"]);
  await expect.poll(async () => (await session.snapshot()).status).toBe("idle");
  const results = requests.at(-1).messages.filter((message: any) => message.role === "tool");
  expect(results).toHaveLength(4);
  expect(results[2].content).toContain("after");
  expect(results[3].content).toContain("after");
  expect(await readFile(join(directory, "workspaces", "one", "note.txt"), "utf8")).toBe("after");
  await manager.close();
  manager = createSessionManager({ directory, endpoint, loadMcpConfigs: () => [] });
  await manager.resume();
  await (await manager.getSession("one")).submit("native-2", "Continue");
  await expect.poll(() => requests.length).toBe(6);
  await expect.poll(async () => (await (await manager.getSession("one")).snapshot()).status).toBe("idle");
  expect(requests.at(-1).tools.map((tool: any) => tool.function.name).sort()).toEqual(["bash", "edit", "read", "write"]);
  expect(await readFile(join(directory, "workspaces", "one", "note.txt"), "utf8")).toBe("after");
  await manager.openSession("two");
  await expect(readFile(join(directory, "workspaces", "two", "note.txt"))).rejects.toThrow();
});
