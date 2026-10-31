import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { openKnowledge } from "../src/lib/server/knowledge";
import { embeddingServer } from "./fixtures/embedding-server";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.reverse()) await f();
  cleanup.length = 0;
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-"));
  const endpoint = await embeddingServer();
  let config = endpoint.config;
  cleanup.push(
    () => rm(directory, { recursive: true, force: true }),
    () => endpoint.close(),
  );
  const start = () => {
    const service = openKnowledge({ directory, loadConfig: () => config });
    cleanup.push(() => service.close());
    return service;
  };
  return {
    service: start(),
    start,
    endpoint,
    directory,
    change: () => {
      config = { ...config, modelId: "changed-model" };
    },
  };
}
async function upload(
  service: any,
  id: string,
  text: string,
  name = "notes.md",
) {
  return service.upload(id, name, Buffer.from(text));
}
// Removing collection scoping or using a lexical-only index makes these fail.
test("English and Chinese semantic search, stable citations, PDF page refs, isolation and deletion", async () => {
  const { service, endpoint, directory } = await setup();
  const a = service.createCollection("Personal 笔记"),
    b = service.createCollection("Separate");
  const apple = await upload(
    service,
    a.id,
    "The orchard grows apples.\n\n苹果在果园里生长。",
    "../unsafe.md",
  );
  const ocean = await upload(service, b.id, "Whales live in the ocean.");
  const pdf = await service.upload(
    a.id,
    "text.pdf",
    await readFile("tests/fixtures/text-pages.pdf"),
  );
  await service.idle();
  expect(service.documents(a.id).every((d: any) => d.status === "ready")).toBe(
    true,
  );
  expect(endpoint.requests[0].authorization).toBe(
    "Bearer embedding-fixture-key",
  );
  const hits = await service.searchKnowledgeBases([a.id], "果园", 3);
  expect(hits[0].documentId).toBe(apple.id);
  expect(hits.some((h: any) => h.documentId === ocean.id)).toBe(false);
  expect(
    (await service.searchKnowledgeBases([b.id], "海洋"))[0].documentId,
  ).toBe(ocean.id);
  const pages = await service.searchKnowledgeBases([a.id], "Mars planet");
  expect(pages[0]).toMatchObject({ documentId: pdf.id, page: 2 });
  const source = service.source(hits[0].sourceId);
  expect(source.text).toContain("苹果");
  expect(source.url).toBe(`/sources/${hits[0].sourceId}`);
  expect(await service.searchKnowledgeBases([], "anything")).toEqual([]);
  expect(
    (await service.searchKnowledgeBases([a.id], "fruit", 999)).length,
  ).toBeLessThanOrEqual(20);
  const tool = service.createKnowledgeTool([b.id]);
  expect(tool.replay).toBe("safe");
  const result = await tool.execute(
    { query: "鲸鱼", limit: 2 },
    {} as any,
    {} as any,
  );
  expect(
    JSON.parse((result.output![0] as { type: "text"; text: string }).text)[0]
      .documentId,
  ).toBe(ocean.id);
  expect(JSON.stringify(result)).not.toContain(apple.id);
  await service.deleteDocument(apple.id);
  expect(() => service.source(hits[0].sourceId)).toThrow(/not found/i);
  expect(
    (await service.searchKnowledgeBases([a.id], "orchard")).some(
      (h: any) => h.documentId === apple.id,
    ),
  ).toBe(false);
  await expect(access(join(directory, "uploads", apple.id))).rejects.toThrow();
  const oceanSource = (await service.searchKnowledgeBases([b.id], "海洋"))[0]
    .sourceId;
  await service.deleteCollection(b.id);
  expect(() => service.source(oceanSource)).toThrow();
});

test("bounded uploads, unsupported types, empty/scanned PDFs and sanitized retry failures", async () => {
  const { service, endpoint } = await setup();
  const c = service.createCollection("Limits");
  await expect(upload(service, c.id, "x", "file.exe")).rejects.toThrow(
    /PDF|Markdown|text/,
  );
  await expect(
    service.upload(c.id, "huge.txt", Buffer.alloc(10 * 1024 * 1024 + 1)),
  ).rejects.toThrow(/10 MiB/);
  const empty = await upload(service, c.id, " \n ");
  const emptyPdf = await service.upload(c.id, "empty.pdf", new Uint8Array());
  const scanned = await service.upload(
    c.id,
    "scanned.pdf",
    await readFile("tests/fixtures/image-only.pdf"),
  );
  await service.idle();
  expect(service.document(empty.id).status).toBe("failed");
  expect(service.document(emptyPdf.id).error).toMatch(/PDF/);
  expect(service.document(scanned.id).error).toMatch(/OCR/);
  endpoint.fail(true);
  const failed = await upload(service, c.id, "Orchard apples");
  await service.idle();
  expect(service.document(failed.id)).toMatchObject({ status: "failed" });
  expect(service.document(failed.id).error).not.toContain(
    "private-embedding-secret",
  );
  endpoint.fail(false);
  service.retryDocument(failed.id);
  await service.idle();
  expect(service.document(failed.id).status).toBe("ready");
  endpoint.invalid(true);
  const invalid = await upload(service, c.id, "ocean");
  await service.idle();
  expect(service.document(invalid.id).error).toMatch(/vector|dimension/i);
  for (const mode of ["mixed", "zero"] as const) {
    endpoint.invalid(mode);
    const bad = await upload(
      service,
      c.id,
      "Ocean whales. 海洋鲸鱼。".repeat(200),
    );
    await service.idle();
    expect(service.document(bad.id).error).toMatch(/vector|dimension/i);
  }
  endpoint.invalid(false);
  const large = await upload(
    service,
    c.id,
    "Ocean whales. 海洋鲸鱼。".repeat(3000),
  );
  await service.idle();
  expect(service.document(large.id).status).toBe("ready");
  expect(endpoint.requests.every((r) => r.input.length <= 32)).toBe(true);
  expect(endpoint.requests.some((r) => r.input.length === 32)).toBe(true);
});

test("embedding changes require explicit atomic reindex; failed staged work never mixes old vectors", async () => {
  const { service, change, endpoint } = await setup();
  const c = service.createCollection("Reindex");
  const a = await upload(service, c.id, "苹果 apple orchard");
  await upload(service, c.id, "Whales ocean");
  await service.idle();
  const ref = (await service.searchKnowledgeBases([c.id], "果园"))[0].sourceId;
  change();
  expect(service.collections()[0].needsReindex).toBe(true);
  await expect(service.searchKnowledgeBases([c.id], "orchard")).rejects.toThrow(
    /reindex/i,
  );
  await expect(upload(service, c.id, "new text")).rejects.toThrow(/reindex/i);
  endpoint.fail(true);
  service.reindex(c.id);
  await service.idle();
  await expect(service.searchKnowledgeBases([c.id], "orchard")).rejects.toThrow(
    /reindex/i,
  );
  endpoint.fail(false);
  service.reindex(c.id);
  await service.idle();
  expect(service.collections()[0].needsReindex).toBe(false);
  expect((await service.searchKnowledgeBases([c.id], "果园"))[0]).toMatchObject(
    { sourceId: ref, documentId: a.id },
  );
});

test("restart retries interrupted jobs and deletion during embeddings cannot resurrect chunks", async () => {
  const { service, endpoint, directory, start } = await setup();
  const c = service.createCollection("Restart");
  const d = await upload(service, c.id, "ocean whale");
  await service.idle();
  await service.close();
  // Persisted indexing marker models the exact state left by interruption.
  const db = new DatabaseSync(join(directory, "app.sqlite"));
  db.prepare("UPDATE knowledge_documents SET status='indexing' WHERE id=?").run(
    d.id,
  );
  db.close();
  const resumed = start();
  await resumed.idle();
  expect(resumed.document(d.id).status).toBe("ready");
  endpoint.hold(true);
  const held = await upload(resumed, c.id, "apples orchard");
  for (
    let i = 0;
    i < 200 && resumed.document(held.id).status !== "indexing";
    i++
  )
    await new Promise((r) => setTimeout(r, 5));
  await resumed.deleteDocument(held.id);
  endpoint.hold(false);
  await resumed.idle();
  expect(() => resumed.document(held.id)).toThrow(/not found/i);
  expect(
    (await resumed.searchKnowledgeBases([c.id], "apples")).some(
      (h: any) => h.documentId === held.id,
    ),
  ).toBe(false);
});

// A real SIGKILL proves startup recovers persisted work without an in-memory queue.
test("SIGKILL during an actual embedding request restarts the persisted indexing job", async () => {
  const { fork } = await import("node:child_process");
  const directory = await mkdtemp(join(tmpdir(), "knowledge-crash-"));
  const endpoint = await embeddingServer();
  endpoint.hold(true);
  cleanup.push(
    () => rm(directory, { recursive: true, force: true }),
    () => endpoint.close(),
  );
  const spawn = (create: boolean) => {
    const child = fork("tests/fixtures/knowledge-child.ts", [], {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        DATA_DIR: directory,
        EMBEDDING_CONFIG: JSON.stringify(endpoint.config),
        CREATE_DOCUMENT: create ? "1" : "0",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    cleanup.push(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await new Promise((r) => child.once("exit", r));
      }
    });
    return child;
  };
  const first = spawn(true);
  const original = await new Promise<any>((r, reject) => {
    first.once("message", r);
    first.once("exit", () => reject(Error("child exited before upload")));
  });
  for (let i = 0; i < 300 && endpoint.requests.length === 0; i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(endpoint.requests).toHaveLength(1);
  first.kill("SIGKILL");
  await new Promise((r) => first.once("exit", r));
  endpoint.hold(false);
  const second = spawn(false);
  const recovered = await new Promise<any>((r, reject) => {
    second.once("message", r);
    second.once("exit", () => reject(Error("child exited before recovery")));
  });
  expect(recovered.documents).toEqual([
    expect.objectContaining({ id: original.documentId, status: "ready" }),
  ]);
  expect(recovered.hits[0].documentId).toBe(original.documentId);
});

test("chunks bound English/Chinese text with overlap and retain page metadata", async () => {
  const { extract } = await import("../src/lib/server/knowledge/extract");
  const text = "An orchard grows apples. 苹果在果园里生长。\n\n".repeat(100);
  const chunks = await extract(Buffer.from(text), "md");
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks.every((p) => p.text.length <= 1200)).toBe(true);
  expect(chunks[0].text.slice(-100)).toContain(chunks[1].text.slice(0, 30));
  const pages = await extract(
    await readFile("tests/fixtures/text-pages.pdf"),
    "pdf",
  );
  expect(pages.map((p) => p.page)).toEqual([1, 2]);
});

test("persisted ingestion queue accepts at most 100 pending documents with one active embed batch", async () => {
  const { service, endpoint } = await setup();
  endpoint.hold(true);
  const c = service.createCollection("Bounded queue");
  for (let i = 0; i < 100; i++) await upload(service, c.id, "Orchard apples");
  await expect(upload(service, c.id, "Excess document")).rejects.toThrow(
    /queue is full/,
  );
  expect(endpoint.requests).toHaveLength(1);
  endpoint.hold(false);
  await service.idle();
  expect(
    service.documents(c.id).filter((d: any) => d.status === "ready"),
  ).toHaveLength(100);
});

test("the replay-safe retrieval tool forwards native Stop cancellation to embeddings", async () => {
  const { service, endpoint } = await setup();
  const c = service.createCollection("Cancellation");
  await upload(service, c.id, "Orchard apples");
  await service.idle();
  endpoint.hold(true);
  const controller = new AbortController();
  const task = service
    .createKnowledgeTool([c.id])
    .execute(
      { query: "fruit" },
      {} as any,
      { abortSignal: controller.signal } as any,
    );
  void task.catch(() => {});
  controller.abort();
  const outcome = await Promise.race([
    task.then(
      () => "resolved",
      () => "cancelled",
    ),
    new Promise((r) => setTimeout(() => r("still waiting"), 250)),
  ]);
  endpoint.hold(false);
  await task.catch(() => {});
  expect(outcome).toBe("cancelled");
});

test("ingestDocument waits for an already queued upload and is idempotent after readiness", async () => {
  const { service, endpoint } = await setup();
  const c = service.createCollection("Ingest interface");
  const d = await upload(service, c.id, "Orchard apples");
  await expect(service.ingestDocument(d.id)).resolves.toBeUndefined();
  expect(service.document(d.id).status).toBe("ready");
  const requests = endpoint.requests.length;
  await service.ingestDocument(d.id);
  expect(endpoint.requests).toHaveLength(requests);
});
