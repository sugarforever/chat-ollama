import { Worker } from "node:worker_threads";
import type { SearchHit } from "../../contracts";
// Inline worker survives both independently bundled bootstrap and route builds.
// SQLite iterators bound memory to one row plus top-k; vectors never enter main heap.
const scoringWorker = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(workerData.file, { readOnly: true });
try {
  db.exec('BEGIN');
  const { ids, fingerprint, query, limit } = workerData;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(\`SELECT ch.source_id,ch.vector FROM knowledge_chunks ch
    JOIN knowledge_documents d ON d.id=ch.document_id
    JOIN knowledge_collections c ON c.id=d.collection_id
    WHERE c.id IN (\${placeholders}) AND c.fingerprint=? AND ch.generation=c.generation
    AND d.status='ready'\`).iterate(...ids, fingerprint);
  const best = [];
  for (const row of rows) {
    const v = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
    if (v.length !== query.length) throw Error('Incompatible vector dimensions; reindex required');
    let score=0; for(let i=0;i<v.length;i++) score += v[i]*query[i];
    if(best.length < limit || score > best[best.length-1].score) {
      best.push({sourceId:row.source_id,score});
      best.sort((a,b)=>b.score-a.score || a.sourceId.localeCompare(b.sourceId));
      if(best.length>limit)best.pop();
    }
  }
  const source = db.prepare(\`SELECT ch.source_id AS sourceId,d.id AS documentId,d.title,ch.text,ch.page
    FROM knowledge_chunks ch JOIN knowledge_documents d ON d.id=ch.document_id
    JOIN knowledge_collections c ON c.id=d.collection_id
    WHERE ch.source_id=? AND ch.generation=c.generation AND d.status='ready'\`);
  parentPort.postMessage({ hits:best.map(hit=>({...source.get(hit.sourceId),score:hit.score})) });
} catch { parentPort.postMessage({error:'Knowledge search failed; verify embedding dimensions and reindex'}); }
finally {db.close();}
`;
export function scoreVectors(
  file: string,
  ids: string[],
  fingerprint: string,
  query: number[],
  limit: number,
): Promise<SearchHit[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(scoringWorker, {
      eval: true,
      workerData: { file, ids, fingerprint, query, limit },
    });
    worker.once("error", reject);
    worker.once("message", (m) =>
      m.error
        ? reject(Error(m.error))
        : resolve(
            m.hits.map((h: SearchHit) => ({ ...h, page: h.page ?? undefined })),
          ),
    );
    worker.once("exit", (code) => {
      if (code !== 0) reject(Error("Knowledge search worker stopped"));
    });
  });
}
