import { nativeProvider } from "./providers";
import { loadProviders, resolveChatEndpoint } from "./settings";

export class ModelDiscoveryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function fetchModels(url: URL, headers: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(12000) });
  } catch (error) {
    throw new ModelDiscoveryError(502, error instanceof Error && error.name === "TimeoutError"
      ? "Provider request timed out. Retry in a moment."
      : "Cannot reach the provider from the server. Check the server network connection and retry.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    const message = response.status === 401 || response.status === 403
      ? "Connection failed. The provider rejected the API key or denied access."
      : response.status === 429 ? "Provider rate limit reached. Wait a moment and retry."
      : response.status === 404 ? "The provider models endpoint was not found. Check the base URL."
      : `Provider models request failed (HTTP ${response.status}). Retry or check the provider status.`;
    throw new ModelDiscoveryError(response.status === 401 || response.status === 403 ? 400 : 502, message);
  }
  return response;
}

export async function discoverModels(input: Record<string, unknown>) {
  const service = typeof input.service === "string" ? input.service : "custom";
  const native = service === "custom" ? undefined : nativeProvider(service);
  if (input.authMode === "oauth") throw Error("Use account login");
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl : native?.baseUrl ?? "";
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error("Invalid endpoint");
  let key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!key && typeof input.id === "string") {
    const saved = loadProviders().providers.find(p => p.id === input.id);
    // A stored credential may only be tested against its own saved endpoint.
    if (!saved || saved.baseUrl !== baseUrl || (saved.service ?? "custom") !== service || saved.authMode === "oauth") throw Error("Invalid connection");
    key = resolveChatEndpoint({ providerId: saved.id, modelId: saved.modelId }).apiKey;
  }
  if (key.length > 8192 || (!key && input.authMode !== "none")) throw Error("Missing key");
  const api = native?.getModels()[0]?.api ?? input.protocol ?? "openai-completions";
  const headers: Record<string, string> = { accept: "application/json" };
  url.pathname = url.pathname.replace(/\/$/, "") + (api === "anthropic-messages" ? "/v1/models" : "/models");
  if (api === "anthropic-messages") {
    headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01";
    url.searchParams.set("limit", "1000");
  } else if (api === "google-generative-ai") headers["x-goog-api-key"] = key;
  else if (key) headers.authorization = `Bearer ${key}`;
  // OpenRouter publishes /models without authenticating; /key validates the credential.
  if (service === "openrouter") {
    const keyUrl = new URL(baseUrl.replace(/\/$/, "") + "/key");
    const check = await fetchModels(keyUrl, headers);
    await check.body?.cancel();
  }
  const response = await fetchModels(url, headers);
  const raw = await response.text();
  if (raw.length > 2_000_000) throw Error("Model response too large");
  const payload = JSON.parse(raw);
  const data = api === "google-generative-ai" ? payload.models : payload.data;
  if (!Array.isArray(data)) throw Error("Invalid model list");
  const seen = new Set<string>();
  const models = data.flatMap((item: any) => {
    if (api === "google-generative-ai" && !item.supportedGenerationMethods?.includes("generateContent")) return [];
    const id = api === "google-generative-ai" ? item.name?.replace(/^models\//, "") : item.id;
    if (typeof id !== "string" || !id || id.length > 200 || /[\u0000-\u001f]/.test(id) || seen.has(id) || /(?:embedding|whisper|tts|dall-e|sora|moderation|realtime)/i.test(id)) return [];
    seen.add(id);
    const created = typeof item.created === "number" ? item.created : Date.parse(item.created_at ?? "") / 1000;
    return [{ id, created: Number.isFinite(created) ? created : 0 }];
  }).slice(0, 2000).sort((a, b) => b.created - a.created);
  if (!models.length) throw Error("No chat models available");
  return { models: models.map(m => m.id), defaultModelId: models[0].id };
}
