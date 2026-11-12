import { json } from "@sveltejs/kit";
import { body } from "$lib/server/api";
import { discoverModels } from "$lib/server/provider-models";
export async function POST({ request }: { request: Request }) {
  try {
    return json(await discoverModels(await body(request)), { headers: { "cache-control": "no-store" } });
  } catch {
    return json({ error: { code: "MODEL_DISCOVERY_FAILED", message: "Connection failed. Check the API key and endpoint, then retry." } }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
