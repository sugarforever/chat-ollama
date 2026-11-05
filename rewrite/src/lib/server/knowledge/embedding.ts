import { createHash } from "node:crypto";
import type { EmbeddingConfig } from "../settings";
export function fingerprint(config: EmbeddingConfig) {
  // Include key changes conservatively (provider/account can affect routing), never expose it.
  return createHash("sha256")
    .update(
      JSON.stringify([
        config.baseUrl.replace(/\/+$/, ""),
        config.modelId,
        config.apiKey,
      ]),
    )
    .digest("hex");
}
export async function embed(
  config: EmbeddingConfig,
  input: string[],
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelId,
        input,
        encoding_format: "float",
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
  } catch {
    throw Error(
      "Embedding request failed; check endpoint, model and authentication",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(
      "Embedding request failed; check endpoint, model and authentication",
    );
  }
  // Bound provider-controlled JSON as well as input batches.
  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16 * 1024 * 1024) {
      await reader.cancel();
      throw Error("Embedding response exceeds limit");
    }
    parts.push(value);
  }
  let body: { data: { index: number; embedding: number[] }[] };
  try {
    body = JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw Error("Invalid embedding vector response");
  }
  if (!Array.isArray(body.data) || body.data.length !== input.length)
    throw Error("Invalid embedding vector count");
  const rows = body.data.slice().sort((a, b) => a.index - b.index);
  const dimensions = rows[0]?.embedding?.length;
  if (!dimensions || dimensions > 8192)
    throw Error("Invalid embedding vector dimensions");
  return rows.map((row, index) => {
    if (
      row.index !== index ||
      !Array.isArray(row.embedding) ||
      row.embedding.length !== dimensions ||
      !row.embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    )
      throw Error("Invalid embedding vector dimensions");
    const norm = Math.hypot(...row.embedding);
    if (!norm || !Number.isFinite(norm))
      throw Error("Invalid empty embedding vector");
    return row.embedding.map((n) => n / norm);
  });
}
