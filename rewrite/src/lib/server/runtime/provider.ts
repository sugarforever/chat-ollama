import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { AuthContext } from "@earendil-works/pi-ai";
import { createProvider, type Provider } from "@earendil-works/pi-ai/models";
import type { CredentialStore, Credential } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { nativeProvider, captureModel } from "../providers";
import { credentialStore } from "../provider-credentials";
import type { ChatEndpointConfig } from "./session";
export function runtimeCredentialStore(
  current: () => ChatEndpointConfig,
): CredentialStore {
  const delegate = () => {
    const p = current();
    return p.authMode === "oauth" && p.credentialId
      ? credentialStore(p.credentialId)
      : undefined;
  };
  return {
    async read(id, options) {
      const p = current();
      return (
        delegate()?.read(id, options) ??
        Promise.resolve(
          p.authMode === "ambient"
            ? undefined
            : ({
                type: "api_key",
                key:
                  p.apiKey ||
                  (p.service && p.service !== "custom" ? "" : "local"),
                env: p.credentialEnv,
              } as Credential),
        )
      );
    },
    async list() {
      return [];
    },
    async modify(id, fn, options) {
      const d = delegate();
      return d ? d.modify(id, fn, options) : fn(await this.read(id, options));
    },
    async delete(id, options) {
      await delegate()?.delete(id, options);
    },
  };
}
export function runtimeProvider(endpoint: ChatEndpointConfig): Provider {
  const service = endpoint.service ?? "custom";
  const model =
    endpoint.model ??
    captureModel(
      "custom",
      endpoint.modelId,
      endpoint.baseUrl,
      endpoint.protocol,
    );
  const native =
    service === "custom"
      ? createProvider({
          id: "custom",
          baseUrl: endpoint.baseUrl,
          auth: {
            apiKey: {
              name: "Endpoint key",
              async resolve({ credential }) {
                return { auth: { apiKey: credential?.key || "local" } };
              },
            },
          },
          models: [model],
          api: {
            "openai-completions": openAICompletionsApi(),
            "openai-responses": openAIResponsesApi(),
            "anthropic-messages": anthropicMessagesApi(),
            "google-generative-ai": googleGenerativeAIApi(),
          },
        })
      : nativeProvider(service);
  // Keep Pi's private model reference stable while dispatching with the real provider identity.
  return {
    ...native,
    id: "chat",
    baseUrl: endpoint.baseUrl || native.baseUrl,
    auth:
      endpoint.authMode === "oauth"
        ? { oauth: native.auth.oauth }
        : { apiKey: native.auth.apiKey },
    getModels: () => [{ ...model, provider: "chat" }],
    stream: (m, c, o) =>
      native.stream({ ...m, provider: native.id }, c, {
        ...o,
        env: { ...endpoint.credentialEnv, ...o?.env },
      } as typeof o),
    streamSimple: (m, c, o) =>
      native.streamSimple({ ...m, provider: native.id }, c, {
        ...o,
        env: { ...endpoint.credentialEnv, ...o?.env },
      } as typeof o),
  };
}

export function runtimeAuthContext(
  current: () => ChatEndpointConfig,
): AuthContext {
  return {
    async env(name) {
      const p = current();
      return (
        p.credentialEnv?.[name] ??
        (p.authMode === "ambient" || p.useAmbientCredentials
          ? process.env[name]
          : undefined)
      );
    },
    async fileExists(path) {
      return existsSync(path.replace(/^~/, homedir()));
    },
  };
}
