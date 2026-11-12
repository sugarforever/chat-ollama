import { json } from "@sveltejs/kit";
import { body } from "$lib/server/api";
import { discoverModels, ModelDiscoveryError } from "$lib/server/provider-models";
export async function POST({ request }: { request: Request }) {
  try {
    return json(await discoverModels(await body(request)), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return json({ error: { code: "MODEL_DISCOVERY_FAILED", message: error instanceof ModelDiscoveryError ? error.message : "Connection failed. Check the API key and endpoint, then retry." } }, { status: error instanceof ModelDiscoveryError ? error.status : 400, headers: { "cache-control": "no-store" } });
  }
}
