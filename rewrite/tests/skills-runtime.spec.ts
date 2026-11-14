import { afterEach, expect, test } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSessionManager } from "../src/lib/server/runtime/manager";
import { createSkillStore } from "../src/lib/server/skills/store";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup.length = 0;
});
test("open conversations discover installed skills, read instructions and supporting files, and refresh after restart/removal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-runtime-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const store = createSkillStore(join(directory, "skills"));
  const requests: any[] = [];
  let reads = 0;
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const request = JSON.parse(text);
    requests.push(request);
    let call: any;
    const context = request.messages.find(
      (m: any) =>
        typeof m.content === "string" &&
        m.content.includes("Available installed skills"),
    );
    if (context && reads < 2) {
      const path = JSON.parse(context.content.split("\n").at(-1)).path;
      call = {
        index: 0,
        id: `read-${reads}`,
        type: "function",
        function: {
          name: "read",
          arguments: JSON.stringify({
            path:
              reads++ === 0
                ? path
                : path.replace("SKILL.md", "references/note.txt"),
          }),
        },
      };
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const [delta, finish_reason] of [
      [
        call
          ? { role: "assistant", tool_calls: [call] }
          : { role: "assistant", content: "Done" },
        null,
      ],
      [{}, call ? "tool_calls" : "stop"],
    ])
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const options = {
    directory: join(directory, "sessions"),
    endpoint: {
      baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
      apiKey: "test",
      modelId: "fixture",
    },
    loadSkillContext: () => store.context(),
  };
  let manager = createSessionManager(options);
  cleanup.push(() => manager.close());
  const session = await manager.openSession("one");
  const found = await store.discover(
    [
      {
        path: "SKILL.md",
        content: Buffer.from(
          "---\nname: test-skill\ndescription: Help with tests\n---\nRead references/note.txt for SECRET_INSTRUCTIONS",
        ),
      },
      {
        path: "references/note.txt",
        content: Buffer.from("SUPPORTING_CONTENT"),
      },
    ],
    "Local folder",
  );
  const [skill] = await store.install(found.importId, [""]);
  await session.submit("first", "Use test-skill");
  await expect.poll(async () => (await session.snapshot()).status).toBe("idle");
  expect(requests[0].messages[0].content).toContain("test-skill");
  expect(
    requests
      .at(-1)
      .messages.filter((m: any) => m.role === "tool")
      .map((m: any) => m.content)
      .join("\n"),
  ).toContain("SECRET_INSTRUCTIONS");
  expect(
    requests
      .at(-1)
      .messages.filter((m: any) => m.role === "tool")
      .map((m: any) => m.content)
      .join("\n"),
  ).toContain("SUPPORTING_CONTENT");
  const count = requests.length;
  await session.submit("first", "Use test-skill");
  expect(requests).toHaveLength(count);
  await manager.close();
  manager = createSessionManager(options);
  await manager.resume();
  await (await manager.getSession("one")).submit("second", "Continue");
  await expect.poll(() => requests.length).toBe(count + 1);
  await expect
    .poll(
      async () => (await (await manager.getSession("one")).snapshot()).status,
    )
    .toBe("idle");
  expect(requests.at(-1).messages[0].content).toContain(
    "Available installed skills",
  );
  store.remove(skill.id);
  await (
    await manager.getSession("one")
  ).submit("third", "Continue without skills");
  await expect.poll(() => requests.length).toBe(count + 2);
  await expect
    .poll(
      async () => (await (await manager.getSession("one")).snapshot()).status,
    )
    .toBe("idle");
  expect(
    requests
      .at(-1)
      .messages.some(
        (m: any) =>
          typeof m.content === "string" &&
          m.content.includes("Available installed skills"),
      ),
  ).toBe(false);
});

test("conversation exclusions filter global discovery, persist after restart and allow new skills and re-enabling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-exclusions-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const store = createSkillStore(join(directory, "skills"));
  async function install(name: string) {
    const found = await store.discover([{ path: "SKILL.md", content: Buffer.from(`---\nname: ${name}\ndescription: Help with ${name}\n---\nInstructions`) }], "Local folder");
    return (await store.install(found.importId, [""]))[0];
  }
  const skill = await install("excluded-helper");
  const requests: any[] = [];
  let release: () => void = () => {};
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const request = JSON.parse(text);
    requests.push(request);
    if (request.messages.at(-1)?.content === "Hold") await new Promise<void>(resolve => { release = resolve; });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Done" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  const options = {
    directory: join(directory, "sessions"),
    endpoint: { baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`, apiKey: "test", modelId: "fixture" },
    loadSkillContext: (config: import("../src/lib/contracts").ConversationConfig) => store.context(config.excludedSkillIds),
  };
  let manager = createSessionManager(options);
  cleanup.push(() => manager.close());
  async function message(id: string) {
    const session = await manager.getSession(id);
    await session.submit(crypto.randomUUID(), "Continue");
    await expect.poll(async () => (await session.snapshot()).status, { timeout: 10000 }).toBe("idle");
    return requests.at(-1).messages.filter((m: any) => typeof m.content === "string" && m.content.includes("Available installed skills")).map((m: any) => m.content).join("\n");
  }
  const config = { modelId: "fixture", knowledgeBaseIds: [], mcpServerIds: [] };
  const a = (await manager.createConversation(config)).id;
  const b = (await manager.createConversation(config)).id;
  expect(await manager.getSkillExclusions(a)).toEqual([]);
  expect(await message(a)).toContain("excluded-helper");
  const activeSession = await manager.getSession(a);
  await activeSession.submit("hold", "Hold");
  await expect.poll(() => requests.at(-1)?.messages.at(-1)?.content, { timeout: 10000 }).toBe("Hold");
  try {
    await expect(manager.setSkillExclusions(a, [skill.id])).rejects.toMatchObject({ code: "BUSY" });
  } finally { release(); }
  await expect.poll(async () => (await activeSession.snapshot()).status, { timeout: 10000 }).toBe("idle");
  await manager.setSkillExclusions(a, [skill.id]);
  expect(await message(a)).toBe("");
  expect(await message(b)).toContain("excluded-helper");
  await manager.close();
  manager = createSessionManager(options);
  await manager.resume();
  expect(await manager.getSkillExclusions(a)).toEqual([skill.id]);
  await install("new-global-helper");
  const context = await message(a);
  expect(context).not.toContain("excluded-helper");
  expect(context).toContain("new-global-helper");
  await manager.setSkillExclusions(a, []);
  expect(await message(a)).toContain("excluded-helper");
  await expect(manager.setSkillExclusions(a, ["../bad"])).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(manager.setSkillExclusions(a, "bad" as any)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(manager.setSkillExclusions("missing", [])).rejects.toMatchObject({ code: "NOT_FOUND" });
});
