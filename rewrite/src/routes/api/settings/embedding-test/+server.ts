import { json } from "@sveltejs/kit";
import { body } from "$lib/server/api";
import { embed } from "$lib/server/knowledge/embedding";

export async function POST({ request }: { request: Request }) {
  try {
    const input = await body(request);
    if (typeof input.baseUrl !== "string" || typeof input.modelId !== "string" || !input.modelId.trim() || typeof input.apiKey !== "string" || !input.apiKey.trim() || input.apiKey.length > 8192) throw Error();
    const url = new URL(input.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error();
    await embed({ baseUrl: input.baseUrl, modelId: input.modelId, apiKey: input.apiKey }, ["Connection test"], request.signal);
    return json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return json({ error: { code: "EMBEDDING_TEST_FAILED", message: "Embedding connection failed. Check the endpoint, model and API key." } }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
