import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { EffectiveModelMetadata, ModelLimits } from "../contracts";
import type { ChatEndpointConfig } from "./runtime/session";

export const DEFAULT_MODEL_LIMITS: Readonly<ModelLimits> = {
  contextWindow: 32768,
  maxTokens: 4096,
};
// Deployment-owned metadata. Browser settings never write this file.
export function configuredModelLimits(providerId: string): Record<string, ModelLimits> {
  const path = resolve(process.env.DATA_DIR || "data", "model-capabilities.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const config = JSON.parse(raw);
    const record = (value: unknown): value is Record<string, any> =>
      !!value && typeof value === "object" && !Array.isArray(value);
    if (!record(config)) throw Error();
    for (const [provider, models] of Object.entries(config)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(provider) || !record(models) || Object.keys(models).length > 2000) throw Error();
      for (const [id, value] of Object.entries(models)) {
        if (!id.trim() || id.length > 200 || /[\u0000-\u001f]/.test(id) || !record(value)) throw Error();
        const { contextWindow, maxTokens } = value;
        if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0 ||
            !Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > contextWindow) throw Error();
      }
    }
    const models = Object.hasOwn(config, providerId) ? config[providerId] : {};
    return Object.fromEntries(Object.entries(models).map(([id, value]) => {
      const { contextWindow, maxTokens } = value as ModelLimits;
      return [id, { contextWindow, maxTokens }];
    }));
  } catch {
    throw Error("Invalid model capabilities configuration");
  }
}

// Read active runs from their captured endpoint, never from mutable provider settings.
export function effectiveModelMetadata(
  endpoint: ChatEndpointConfig,
): EffectiveModelMetadata {
  const model = endpoint.model;
  const catalog =
    model &&
    model.provider !== "custom" &&
    builtinProviders()
      .find((p) => p.id === model.provider)
      ?.getModels()
      .some((m) => m.id === model.id);
  const source =
    endpoint.modelMetadata?.source ??
    (catalog ? "catalog" : "default");
  return {
    modelId: endpoint.modelId,
    contextWindow:
      model?.contextWindow ??
      DEFAULT_MODEL_LIMITS.contextWindow,
    maxTokens:
      model?.maxTokens ??
      DEFAULT_MODEL_LIMITS.maxTokens,
    source,
    costSource: source === "catalog" ? "catalog" : "unknown",
    ...(source === "catalog" && model ? { cost: { ...model.cost } } : {}),
  };
}
