import { beforeAll, expect, test } from "vitest";
import { execFileSync, fork } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embeddingServer } from "./fixtures/embedding-server";
beforeAll(() => execFileSync("pnpm", ["build"], { stdio: "pipe" }), 120000);
test("built knowledge API and startup scoped tool execute through a real pi run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-http-"));
  const embedding = await embeddingServer();
  const prompts: any[] = [];
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const p of req) raw += p;
    const body = JSON.parse(raw);
    prompts.push(body);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const toolResult = body.messages.find((m: any) => m.role === "tool");
    const delta = toolResult
      ? { role: "assistant", content: "Cited answer" }
      : {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "search-1",
              type: "function",
              function: {
                name: "search_knowledge",
                arguments: JSON.stringify({ query: "果园" }),
              },
            },
          ],
        };
    res.write(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: toolResult ? "stop" : "tool_calls" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  const child = fork("tests/fixtures/http-child.ts", [], {
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
      DATA_DIR: directory,
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr?.on("data", (v) => (stderr += v));
  try {
    const port = await new Promise<number>((resolve, reject) => {
      child.once("message", (m: any) => resolve(m.port));
      child.once("exit", () => reject(Error(stderr)));
    });
    const base = `http://127.0.0.1:${port}`;
    const request = (path: string, data?: unknown, method?: string) =>
      fetch(base + path, {
        method: method ?? (data === undefined ? "GET" : "POST"),
        headers: {
          origin: base,
          ...(data instanceof FormData
            ? {}
            : { "content-type": "application/json" }),
        },
        body:
          data === undefined
            ? undefined
            : data instanceof FormData
              ? data
              : JSON.stringify(data),
      });
    expect((await request("/api/knowledge-bases")).status).toBe(200);
    await request("/api/settings", {
      embedding: embedding.config,
      chat: {
        baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
        modelId: "fixture",
        apiKey: "",
      },
    });
    const a = await (
      await request("/api/knowledge-bases", { name: "Selected" })
    ).json();
    const b = await (
      await request("/api/knowledge-bases", {
        name: "Private other collection",
      })
    ).json();
    const upload = async (id: string, text: string) => {
      const f = new FormData();
      f.set("file", new File([text], "notes.md"));
      return (await request(`/api/knowledge-bases/${id}/documents`, f)).json();
    };
    const d = await upload(
      a.id,
      "Apples grow in an orchard. 苹果在果园里生长。",
    );
    const other = await upload(b.id, "Hidden orchard document.");
    const pdfForm = new FormData();
    pdfForm.set(
      "file",
      new File(
        [new Uint8Array(await readFile("tests/fixtures/text-pages.pdf"))],
        "pages.pdf",
      ),
    );
    const pdf = await (
      await request(`/api/knowledge-bases/${a.id}/documents`, pdfForm)
    ).json();
    let doc: any;
    for (let i = 0; i < 200; i++) {
      doc = await (await request(`/api/documents/${d.id}`)).json();
      if (doc.status === "ready") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(doc.status).toBe("ready");
    for (let i = 0; i < 200; i++) {
      const status = await (await request(`/api/documents/${pdf.id}`)).json();
      if (status.status === "ready" || status.status === "failed") {
        expect(status.status, status.error).toBe("ready");
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    const pdfHits = await (
      await request(`/api/knowledge-bases/${a.id}/search`, {
        query: "Mars planet",
      })
    ).json();
    expect(pdfHits[0]).toMatchObject({ documentId: pdf.id, page: 2 });
    const hits = await (
      await request(`/api/knowledge-bases/${a.id}/search`, { query: "果园" })
    ).json();
    expect(hits[0].documentId).toBe(d.id);
    const conversation = await (
      await request("/api/conversations", {
        modelId: "fixture",
        knowledgeBaseIds: [a.id],
        mcpServerIds: [],
      })
    ).json();
    const source = await request(`/sources/${hits[0].sourceId}?conversationId=${conversation.id}`);
    expect(source.status).toBe(200);
    expect(await source.text()).toContain("苹果");
    expect(
      (
        await request(`/api/conversations/${conversation.id}/messages`, {
          requestId: "knowledge-1",
          content: "Search my orchard notes",
        })
      ).status,
    ).toBe(202);
    for (
      let i = 0;
      i < 300 &&
      !prompts.some((p) => p.messages.some((m: any) => m.role === "tool"));
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    const toolPrompt = prompts.find((p) =>
      p.messages.some((m: any) => m.role === "tool"),
    );
    expect(toolPrompt).toBeTruthy();
    expect(
      JSON.stringify(toolPrompt.messages.find((m: any) => m.role === "tool")),
    ).toContain(d.id);
    expect(JSON.stringify(toolPrompt.messages)).not.toContain(other.id);
    expect(
      (await request(`/api/documents/${d.id}`, undefined, "DELETE")).status,
    ).toBe(204);
    expect((await request(`/sources/${hits[0].sourceId}`)).status).toBe(404);
    expect(
      (await request(`/api/knowledge-bases/${a.id}`, undefined, "DELETE"))
        .status,
    ).toBe(204);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));
    }
    model.closeAllConnections();
    await new Promise<void>((r) => model.close(() => r()));
    await embedding.close();
    await rm(directory, { recursive: true, force: true });
  }
});
