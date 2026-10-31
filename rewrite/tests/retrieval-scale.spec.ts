import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { cpus, totalmem, tmpdir, platform, arch } from "node:os";
import { createServer } from "node:http";
import { openKnowledge } from "../src/lib/server/knowledge";
import { fingerprint } from "../src/lib/server/knowledge/embedding";
import { createSessionManager } from "../src/lib/server/runtime/manager";
import { modelServer } from "./fixtures/model-server";
// Generated storage/CPU benchmark, deliberately not an embedding-quality evaluation.
test("100000 persisted 384-dimensional chunks search under 2 seconds while native chat responds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "retrieval-scale-"));
  const vector = new Float32Array(384);
  vector.fill(1 / Math.sqrt(384));
  const embedding = createServer(async (req, res) => {
    for await (const _ of req) {
      /* drain */
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ data: [{ index: 0, embedding: Array.from(vector) }] }),
    );
  });
  await new Promise<void>((r) => embedding.listen(0, "127.0.0.1", r));
  const config = {
    baseUrl: `http://127.0.0.1:${(embedding.address() as any).port}/v1`,
    modelId: "generated-384",
    apiKey: "",
  };
  const service = openKnowledge({ directory, loadConfig: () => config });
  const model = await modelServer();
  model.release();
  const manager = createSessionManager({
    directory: join(directory, "sessions"),
    endpoint: { baseUrl: model.baseUrl, modelId: "fixture", apiKey: "" },
  });
  try {
    const c = service.createCollection("Scale benchmark");
    const db = new DatabaseSync(join(directory, "app.sqlite"));
    db.exec("PRAGMA journal_mode=WAL; BEGIN");
    db.prepare(
      "UPDATE knowledge_collections SET fingerprint=?,dimensions=384 WHERE id=?",
    ).run(fingerprint(config), c.id);
    const { generation } = db
      .prepare("SELECT generation FROM knowledge_collections WHERE id=?")
      .get(c.id) as { generation: string };
    db.prepare(
      "INSERT INTO knowledge_documents VALUES('benchmark-document',?,'Benchmark','txt','ready',NULL,'2026-10-31')",
    ).run(c.id);
    const insert = db.prepare(
      "INSERT INTO knowledge_chunks VALUES(?,?,?,?,NULL,?)",
    );
    const bytes = Buffer.from(vector.buffer);
    for (let i = 0; i < 100000; i++)
      insert.run(
        `benchmark-source-${i.toString().padStart(6, "0")}`,
        "benchmark-document",
        generation,
        `Generated chunk ${i}`,
        bytes,
      );
    db.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    const session = await manager.openSession("benchmark-chat");
    // Warm the model transport, not the vector scan.
    await session.submit("warmup", "hello");
    for (
      let i = 0;
      i < 1000 && (await session.snapshot()).status === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    const rssBefore = process.memoryUsage().rss;
    let peakRss = rssBefore,
      maxGap = 0,
      last = performance.now(),
      ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      ticks++;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 5);
    const start = performance.now();
    const search = service.searchKnowledgeBases(
      [c.id],
      "find a generated chunk",
      10,
    );
    void search.catch(() => {});
    const chatStart = performance.now();
    await session.submit("concurrent", "Respond during retrieval");
    for (
      let i = 0;
      i < 1000 && (await session.snapshot()).status === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 5));
    const chatMs = performance.now() - chatStart;
    const hits = await search;
    const elapsedMs = performance.now() - start;
    clearInterval(timer);
    const measurements = {
      chunks: 100000,
      dimensions: 384,
      latencyMs: Math.round(elapsedMs),
      concurrentNativeChatMs: Math.round(chatMs),
      maxMainLoopGapMs: Math.round(maxGap),
      mainLoopTicks: ticks,
      rssBeforeMiB: Math.round(rssBefore / 1048576),
      peakRssMiB: Math.round(peakRss / 1048576),
      rssDeltaMiB: Math.round((peakRss - rssBefore) / 1048576),
      hardware: {
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        ramGiB: Math.round(totalmem() / 1073741824),
        platform: platform(),
        arch: arch(),
        node: process.version,
      },
    };
    console.log("RETRIEVAL_BENCHMARK", JSON.stringify(measurements));
    expect(hits).toHaveLength(10);
    expect(elapsedMs).toBeLessThan(2000);
    expect((await session.snapshot()).status).toBe("idle");
    expect(chatMs).toBeLessThan(1000);
    expect(ticks).toBeGreaterThan(2);
    expect(maxGap).toBeLessThan(250);
  } finally {
    await manager.close();
    await service.close();
    await model.close();
    embedding.closeAllConnections();
    await new Promise<void>((r) => embedding.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
