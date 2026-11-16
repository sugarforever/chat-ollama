import { afterEach, expect, test } from "vitest";
import { createServer } from "node:http";
import { fork } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openAgentSession } from "../src/lib/server/runtime/session";
import { captureModel } from "../src/lib/server/providers";
import { modelServer } from "./fixtures/model-server";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0; });
async function fixture(holdFirstSummary = false) {
  const directory = await mkdtemp(join(tmpdir(), "auto-compaction-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const requests: any[] = [];
  let actions = 0;
  let summaries = 0;
  let totalTokens = 0;
  const summarySources: string[] = [];
  let releaseSummary!: () => void;
  const summaryGate = new Promise<void>(resolve => { releaseSummary = resolve; });
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    const summary = body.messages[0]?.content.includes("context summarization assistant");
    if (summary) { summaries++; summarySources.push(JSON.stringify(body.messages)); }
    if (summary && summaries === 1 && holdFirstSummary) await summaryGate;
    const source = JSON.stringify(body.messages);
    const tool = !summary && !source.includes("ACTION-COMPLETE");
    if (tool) actions++;
    const text = summary
      ? ["GOAL-42", "EVIDENCE-17", "ACTION-COMPLETE"].filter(marker => source.includes(marker)).join(" ")
      : "Continue the original task";
    const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: "external", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "printf 'done\\n' >> action.log; printf 'ACTION-%s' COMPLETE" }) } }] } : { role: "assistant", content: text };
    const prompt = JSON.stringify(body.messages);
    const ascii = prompt.replace(/[^\x00-\x7f]/g, "").length;
    const input = Math.ceil(ascii / 4) + [...prompt].filter(c => c.codePointAt(0)! >= 128).length;
    totalTokens += input + 40;
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const [value, finish_reason] of [[delta, null], [{}, tool ? "tool_calls" : "stop"]])
      res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: value, finish_reason }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: input, completion_tokens: 40, total_tokens: input + 40 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  async function child(window = 16384) {
    const proc = fork("tests/fixtures/compaction-child.ts", [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, DATA_DIR: directory, BASE_URL: `http://127.0.0.1:${(server.address() as any).port}/v1`, WINDOW: String(window) },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    cleanups.push(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill("SIGKILL"); await new Promise(r => proc.once("exit", r)); } });
    const next = () => new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("child timeout")), 12000);
      proc.once("message", value => { clearTimeout(timer); resolve(value); });
    });
    expect(await next()).toEqual({ ready: true });
    return {
      async submit(id: string, content: string) { const result = next(); proc.send({ id, content }); return result; },
      async snapshot() { const result = next(); proc.send({ snapshot: true }); return result; },
      async kill() { proc.kill("SIGKILL"); await new Promise(r => proc.once("exit", r)); },
      async close() { proc.send({ close: true }); await new Promise(r => proc.once("exit", r)); },
    };
  }
  return { directory, requests, summarySources, child, releaseSummary, metrics: () => ({ summaries, totalTokens, actions }) };
}

test("native automatic compactions preserve goal/evidence and completed actions across process restart", async () => {
  const started = Date.now();
  const f = await fixture();
  let child = await f.child();
  for (let turn = 0; turn < 12; turn++) {
    if (turn === 6) { await child.close(); child = await f.child(); }
    const result = await child.submit(`turn-${turn}`, `${turn === 0 ? "GOAL-42 EVIDENCE-17" : "Continue the original task"} turn ${turn} ${"目标证据资料".repeat(1200)}`);
    expect(result.error).toBeUndefined();
    expect(result.snapshot.status).toBe("idle");
  }
  await child.close();
  expect(f.metrics().summaries).toBeGreaterThanOrEqual(2);
  for (const source of f.summarySources) {
    expect(source).toContain("GOAL-42");
    expect(source).toContain("EVIDENCE-17");
  }
  expect(f.summarySources.some(source => source.includes("ACTION-COMPLETE"))).toBe(true);
  expect(f.requests.filter(r => !r.messages[0]?.content.includes("context summarization assistant")).at(-1).messages.some((m: any) => JSON.stringify(m.content).includes("<summary>"))).toBe(true);
  expect(await readFile(join(f.directory, "workspaces", "one", "action.log"), "utf8")).toBe("done\n");
  const storage = await openNodeSqliteStorage(join(f.directory, "one.sqlite"));
  try {
    const conversation = (await storage.scanConversations({}, 10, undefined, context)).items[0];
    const entries = (await storage.scanEntries({ conversationId: conversation.id }, 1000, undefined, context)).items;
    expect(entries.filter(e => e.kind === "pi.compaction").length).toBeGreaterThanOrEqual(2);
    expect(entries.filter(e => e.kind === "pi.user")).toHaveLength(12);
    const usageRecord = await storage.findDocument({ kind: "pi.usage", scope: { kind: "conversation", conversationId: conversation.id } }, "current", context);
    expect(usageRecord).toBeDefined();
    const usage = (await storage.document(usageRecord!.id, "current", context))!.value as any;
    expect(Object.values(usage.models).reduce((sum: number, value: any) => sum + value.input + value.output, 0)).toBe(f.metrics().totalTokens);
  } finally { await storage.close(context); }
  console.info("automatic compaction fixture", { ...f.metrics(), elapsedMs: Date.now() - started });
});

test("no valid native cut point permits the first oversized input without a compaction loop", async () => {
  const f = await fixture();
  const child = await f.child();
  const result = await child.submit("first", "单".repeat(30000));
  expect(result.snapshot.status).toBe("idle");
  expect(f.requests.length).toBeLessThan(5);
  await child.close();
});

async function savedPolicy(file: string) {
  const storage = await openNodeSqliteStorage(file);
  try {
    const conversation = (await storage.scanConversations({}, 10, undefined, context)).items[0];
    const record = await storage.findDocument({ kind: "pi.agent", scope: { kind: "conversation", conversationId: conversation.id } }, "current", context);
    return (await storage.document(record!.id, "current", context))!.value.compaction as any;
  } finally { await storage.close(context); }
}

test("creation, idle model switches and reopen persist the effective model budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compaction-switch-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const model = await modelServer();
  model.release();
  cleanups.push(() => model.close());
  let endpoint = { baseUrl: model.baseUrl, apiKey: "test", modelId: "fixture", model: { ...captureModel("custom", "fixture", model.baseUrl), contextWindow: 8192, maxTokens: 1024 } };
  const file = join(directory, "one.sqlite");
  let session = await openAgentSession("one", file, endpoint, () => endpoint);
  cleanups.push(() => session.close());
  const small = await savedPolicy(file);
  await session.submit("small", "Keep the goal");
  await expect.poll(async () => (await session.snapshot()).status).toBe("idle");
  endpoint = { ...endpoint, model: { ...endpoint.model, contextWindow: 1048576, maxTokens: 32768 } };
  await session.submit("large", "Continue");
  await expect.poll(async () => (await session.snapshot()).status).toBe("idle");
  const large = await savedPolicy(file);
  expect(large.keepRecentTokens).toBeGreaterThan(small.keepRecentTokens);
  expect(large.reserveTokens).toBeGreaterThan(small.reserveTokens);
  await session.close();
  session = await openAgentSession("one", file, endpoint, () => endpoint);
  expect(await savedPolicy(file)).toEqual(large);
  expect(model.requests).toHaveLength(2);
});

test("oversized skills reject admission before dispatch and leave history readable on reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compaction-overhead-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const model = await modelServer();
  cleanups.push(() => model.close());
  const endpoint = { baseUrl: model.baseUrl, apiKey: "test", modelId: "fixture", model: { ...captureModel("custom", "fixture", model.baseUrl), contextWindow: 8192, maxTokens: 1024 } };
  const options = { loadSkillContext: () => "技能".repeat(10000) };
  const file = join(directory, "one.sqlite");
  let session = await openAgentSession("one", file, endpoint, undefined, options);
  cleanups.push(() => session.close());
  await expect(session.submit("too-large", "Hello")).rejects.toMatchObject({ code: "CONTEXT_BUDGET" });
  expect(model.requests).toHaveLength(0);
  expect((await session.snapshot()).entries).toHaveLength(0);
  await session.close();
  session = await openAgentSession("one", file, endpoint, undefined, options);
  expect((await session.snapshot()).status).toBe("idle");
  await expect(session.submit("again", "Hello")).rejects.toMatchObject({ code: "CONTEXT_BUDGET" });
});


test("SIGKILL during a summary resumes captured budgets before applying a new idle model selection", async () => {
  const f = await fixture(true);
  const first = await f.child();
  await first.submit("start", `GOAL-42 EVIDENCE-17 ${"目标资料".repeat(1000)}`);
  // Keep submitting until a native threshold starts a paused summary. A
  // background summary may let its generation answer before the summary does.
  let pending: Promise<any> | undefined;
  for (let i = 0; i < 8 && f.metrics().summaries === 0; i++) {
    let settled = false;
    pending = first.submit(`fill-${i}`, "资料".repeat(2500));
    void pending.then(() => { settled = true; }, () => {});
    await expect.poll(() => f.metrics().summaries > 0 || settled, { timeout: 3000 }).toBe(true);
    if (f.metrics().summaries === 0) await pending;
  }
  expect(f.metrics().summaries).toBe(1);
  const captured = await savedPolicy(join(f.directory, "one.sqlite"));
  await first.kill();
  // The killed IPC waiter is intentionally abandoned, not a second submission.
  void pending?.catch(() => {});
  f.releaseSummary();
  const recovered = await f.child(1048576);
  expect(await savedPolicy(join(f.directory, "one.sqlite"))).toEqual(captured);
  await expect.poll(() => f.metrics().summaries, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await recovered.snapshot()).snapshot.status, { timeout: 5000 }).toBe("idle");
  await recovered.submit("new-selection", "Continue");
  expect((await savedPolicy(join(f.directory, "one.sqlite"))).keepRecentTokens).toBeGreaterThan(captured.keepRecentTokens);
  await recovered.close();
  expect(await readFile(join(f.directory, "workspaces", "one", "action.log"), "utf8")).toBe("done\n");
});
