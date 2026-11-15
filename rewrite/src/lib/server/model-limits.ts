import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { EffectiveModelMetadata, ModelLimits } from "../contracts";
import type { ChatEndpointConfig } from "./runtime/session";

export const DEFAULT_MODEL_LIMITS: Readonly<ModelLimits> = {
  contextWindow: 32768,
  maxTokens: 4096,
};
export function validateModelLimits(
  value: unknown,
): Record<string, ModelLimits> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 2000
  )
    throw Error("Invalid model limits");
  return Object.fromEntries(
    Object.entries(value).map(([id, limits]) => {
      if (
        !id.trim() ||
        id.length > 200 ||
        /[\u0000-\u001f]/.test(id) ||
        !limits ||
        typeof limits !== "object" ||
        Array.isArray(limits)
      )
        throw Error("Invalid model limits");
      const { contextWindow, maxTokens } = limits;
      if (
        !Number.isSafeInteger(contextWindow) ||
        contextWindow <= 0 ||
        !Number.isSafeInteger(maxTokens) ||
        maxTokens <= 0 ||
        maxTokens > contextWindow
      )
        throw Error("Invalid model limits");
      return [id, { contextWindow, maxTokens }];
    }),
  );
}

// Read active runs from their captured endpoint, never from mutable provider settings.
export function effectiveModelMetadata(
  endpoint: ChatEndpointConfig,
): EffectiveModelMetadata {
  const model = endpoint.model;
  const configured = Object.hasOwn(endpoint.modelLimits ?? {}, endpoint.modelId)
    ? endpoint.modelLimits![endpoint.modelId]
    : undefined;
  const catalog =
    model &&
    model.provider !== "custom" &&
    builtinProviders()
      .find((p) => p.id === model.provider)
      ?.getModels()
      .some((m) => m.id === model.id);
  const source =
    endpoint.modelMetadata?.source ??
    (catalog ? "catalog" : configured ? "custom" : "default");
  return {
    modelId: endpoint.modelId,
    contextWindow:
      model?.contextWindow ??
      configured?.contextWindow ??
      DEFAULT_MODEL_LIMITS.contextWindow,
    maxTokens:
      model?.maxTokens ??
      configured?.maxTokens ??
      DEFAULT_MODEL_LIMITS.maxTokens,
    source,
    costSource: source === "catalog" ? "catalog" : "unknown",
    ...(source === "catalog" && model ? { cost: { ...model.cost } } : {}),
  };
}
