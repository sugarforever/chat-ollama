import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Provider } from "@earendil-works/pi-ai/models";
import { ApiError } from "./errors";
export type AuthMode = "api_key" | "oauth" | "ambient" | "none";
export const customProtocols = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;
export type CustomProtocol = (typeof customProtocols)[number];
// Factories retain each provider's mixed-protocol dispatch, model metadata and auth semantics.
export function nativeProvider(service: string): Provider {
  const p = builtinProviders().find((p) => p.id === service);
  if (!p) throw new ApiError(400, "INVALID_INPUT", "Unknown model service");
  return p;
}
export function providerCatalog() {
  return builtinProviders().map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl ?? "",
    authModes: [
      ...(p.auth.apiKey ? ["api_key", "ambient"] : []),
      ...(p.auth.oauth ? ["oauth"] : []),
    ] as AuthMode[],
    apiKeyLabel: p.auth.apiKey?.name,
    oauthLabel: p.auth.oauth?.loginLabel ?? p.auth.oauth?.name,
    models: p.getModels().map((m) => ({ id: m.id, name: m.name, api: m.api })),
  }));
}
export function captureModel(
  service: string,
  id: string,
  baseUrl: string,
  protocol: CustomProtocol = "openai-completions",
): Model<Api> {
  if (service !== "custom") {
    const provider = nativeProvider(service);
    const model = provider.getModels().find((m) => m.id === id);
    if (!model)
      throw new ApiError(
        400,
        "MODEL_NOT_FOUND",
        "Select a model from this service catalog",
      );
    return {
      ...model,
      ...(baseUrl && baseUrl !== provider.baseUrl ? { baseUrl } : {}),
    };
  }
  return {
    id,
    name: id,
    provider: "custom",
    api: protocol,
    baseUrl,
    input: ["text"],
    reasoning: false,
    contextWindow: 32768,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}
