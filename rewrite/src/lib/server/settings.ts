import { readCredential } from "./provider-credentials";
import { randomUUID } from "node:crypto";
import {
  providerCatalog,
  nativeProvider,
  captureModel,
  customProtocols,
  type AuthMode,
} from "./providers";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { ApiError } from "./errors";
import type { ProviderSelection, PublicProvider } from "../contracts";
import type { ChatEndpointConfig } from "./runtime/session";
export type EmbeddingConfig = ChatEndpointConfig;
export function appDatabase() {
  const directory = resolve(process.env.DATA_DIR || "data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const file = join(directory, "app.sqlite");
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings (kind TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  return db;
}
function validateEndpoint(endpoint: ChatEndpointConfig): ChatEndpointConfig {
  try {
    const url = new URL(endpoint.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error();
  } catch {
    // URL parsing errors can contain the original input and embedded credentials.
    throw Error("Invalid endpoint");
  }
  return endpoint;
}
function load(kind: "chat" | "embedding"): ChatEndpointConfig {
  const db = appDatabase();
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE kind=?")
      .get(kind) as { value: string } | undefined;
    return validateEndpoint(
      row
        ? JSON.parse(row.value)
        : {
            baseUrl:
              process.env[
                kind === "chat" ? "CHAT_BASE_URL" : "EMBEDDING_BASE_URL"
              ] || "http://127.0.0.1:11434/v1",
            modelId:
              process.env[
                kind === "chat" ? "CHAT_MODEL_ID" : "EMBEDDING_MODEL_ID"
              ] || "local",
            apiKey:
              process.env[
                kind === "chat" ? "CHAT_API_KEY" : "EMBEDDING_API_KEY"
              ] || "",
          },
    );
  } finally {
    db.close();
  }
}
export type Provider = ChatEndpointConfig & { id: string; name: string };
type Providers = { providers: Provider[]; defaultProviderId: string };
export const LEGACY_PROVIDER_ID = "legacy";
export function loadProviders(): Providers {
  const db = appDatabase();
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE kind='providers'")
      .get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value);
    // Freeze the previous saved endpoint (or environment seed) before any edits.
    const imported = {
      providers: [
        { ...load("chat"), id: LEGACY_PROVIDER_ID, name: "Legacy chat" },
      ],
      defaultProviderId: LEGACY_PROVIDER_ID,
    };
    db.prepare("INSERT OR IGNORE INTO settings VALUES ('providers',?)").run(
      JSON.stringify(imported),
    );
    return imported;
  } finally {
    db.close();
  }
}
export function resolveChatEndpoint(
  selection: ProviderSelection,
): ChatEndpointConfig {
  const provider = loadProviders().providers.find(
    (p) => p.id === selection.providerId,
  );
  if (!provider)
    throw new ApiError(
      409,
      "PROVIDER_NOT_FOUND",
      "Selected provider is unavailable; choose a provider in this conversation",
    );
  // Legacy snapshots retain their original completions-only shape.
  if (!provider.service)
    return {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: selection.modelId,
    };
  const stored = provider.credentialId
    ? readCredential(provider.credentialId)
    : undefined;
  return {
    ...provider,
    ...(stored?.type === "api_key" && provider.authMode === "api_key"
      ? {
          apiKey: stored.key ?? "",
          credentialEnv: stored.env,
          ...(provider.service === "amazon-bedrock" &&
          !stored.key &&
          !stored.env
            ? { useAmbientCredentials: true }
            : {}),
        }
      : {}),
    modelId: selection.modelId,
    model: captureModel(
      provider.service,
      selection.modelId,
      provider.baseUrl,
      provider.protocol,
    ),
  };
}
export const loadChatConfig = () => {
  const saved = loadProviders();
  const provider = saved.providers.find(
    (p) => p.id === saved.defaultProviderId,
  )!;
  return resolveChatEndpoint({
    providerId: provider.id,
    modelId: provider.modelId,
  });
};
export const loadEmbeddingConfig = () => load("embedding");
export function publicSettings() {
  const redact = ({
    apiKey,
    credentialEnv,
    credentialId,
    model,
    useAmbientCredentials,
    ...value
  }: ChatEndpointConfig) => ({
    ...value,
    hasApiKey:
      !!apiKey ||
      !!(
        credentialId &&
        readCredential(credentialId)?.type === "api_key" &&
        (readCredential(credentialId) as { key?: string })?.key
      ),
  });
  const saved = loadProviders();
  return {
    // Compatibility for existing clients. This alias always edits the default provider.
    chat: redact(loadChatConfig()),
    embedding: redact(loadEmbeddingConfig()),
    providers: saved.providers.map((p) => redact(p) as PublicProvider),
    defaultProviderId: saved.defaultProviderId,
    catalog: providerCatalog(),
    customProtocols,
  };
}
function patchEndpoint(
  current: ChatEndpointConfig,
  patch: unknown,
): ChatEndpointConfig {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw Error("Invalid settings");
  const next = { ...current };
  for (const key of ["baseUrl", "modelId", "apiKey"] as const) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (
      typeof value !== "string" ||
      value.length > (key === "modelId" ? 200 : 8192) ||
      (key !== "apiKey" && !value.trim())
    )
      throw Error("Invalid settings");
    next[key] = value;
  }
  return validateEndpoint(next);
}
export function saveSettings(input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid settings");
  const current = loadProviders();
  let providers = current.providers;
  if (input.providers !== undefined) {
    if (
      !Array.isArray(input.providers) ||
      !input.providers.length ||
      input.providers.length > 100 ||
      input.chat !== undefined
    )
      throw Error("Invalid providers");
    const ids = new Set<string>();
    providers = input.providers.map((p) => {
      if (
        !p ||
        typeof p !== "object" ||
        typeof p.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id) ||
        ids.has(p.id) ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 100 ||
        (p.service === undefined && typeof p.baseUrl !== "string") ||
        typeof p.modelId !== "string"
      )
        throw Error("Invalid provider");
      ids.add(p.id);
      const old = current.providers.find((old) => old.id === p.id);
      if (p.service === undefined)
        return {
          ...patchEndpoint(
            { baseUrl: "", modelId: "", apiKey: old?.apiKey ?? "" },
            p,
          ),
          id: p.id,
          name: p.name.trim(),
        };
      if (typeof p.service !== "string") throw Error("Invalid service");
      const native =
        p.service === "custom" ? undefined : nativeProvider(p.service);
      const authMode: AuthMode =
        p.authMode ??
        (native?.auth.apiKey ? "api_key" : native ? "oauth" : "none");
      if (
        !(
          native
            ? [
                ...(native.auth.apiKey ? ["api_key", "ambient"] : []),
                ...(native.auth.oauth ? ["oauth"] : []),
              ]
            : ["api_key", "none"]
        ).includes(authMode)
      )
        throw Error("Invalid authentication mode");
      const same = old?.service === p.service && old?.authMode === authMode;
      const stored =
        same && old?.credentialId
          ? readCredential(old.credentialId)
          : undefined;
      const previousKey = same
        ? stored?.type === "api_key"
          ? (stored.key ?? old?.apiKey ?? "")
          : (old?.apiKey ?? "")
        : "";
      const previousEnv = same
        ? stored?.type === "api_key"
          ? (stored.env ?? old?.credentialEnv)
          : old?.credentialEnv
        : undefined;

      const baseUrl = p.baseUrl ?? native?.baseUrl ?? "";
      if (typeof baseUrl !== "string") throw Error("Invalid endpoint");
      // Subscription tokens must never be sent to a user-selected endpoint.
      if (authMode === "oauth" && baseUrl !== (native?.baseUrl ?? ""))
        throw Error("OAuth uses the official endpoint");
      const endpoint = baseUrl
        ? patchEndpoint(
            {
              baseUrl,
              modelId: p.modelId,
              apiKey: previousKey,
            },
            { ...p, baseUrl },
          )
        : {
            baseUrl: "",
            modelId: p.modelId,
            apiKey: previousKey,
          };
      if (!baseUrl && p.apiKey !== undefined) {
        if (typeof p.apiKey !== "string" || p.apiKey.length > 8192)
          throw Error("Invalid key");
        endpoint.apiKey = p.apiKey;
      }
      if (authMode !== "api_key") endpoint.apiKey = "";
      const protocol = p.protocol ?? "openai-completions";
      if (!customProtocols.includes(protocol)) throw Error("Invalid protocol");
      const credentialEnv =
        p.credentialEnv === undefined ? previousEnv : p.credentialEnv;
      if (
        credentialEnv !== undefined &&
        (!credentialEnv ||
          typeof credentialEnv !== "object" ||
          Array.isArray(credentialEnv) ||
          Object.entries(credentialEnv).some(
            ([k, v]) =>
              !/^[A-Z][A-Z0-9_]{0,100}$/.test(k) ||
              typeof v !== "string" ||
              v.length > 8192,
          ))
      )
        throw Error("Invalid provider credential configuration");
      captureModel(p.service, p.modelId, baseUrl, protocol);
      return {
        ...endpoint,
        id: p.id,
        name: p.name.trim(),
        service: p.service,
        authMode,
        protocol,
        ...(authMode === "api_key" &&
        p.service === "amazon-bedrock" &&
        p.apiKey === undefined &&
        (old?.useAmbientCredentials ||
          (stored?.type === "api_key" && !stored.key && !stored.env))
          ? { useAmbientCredentials: true }
          : {}),
        ...(credentialEnv && authMode === "api_key" ? { credentialEnv } : {}),
        ...(same &&
        old?.credentialId &&
        p.apiKey === undefined &&
        p.credentialEnv === undefined
          ? { credentialId: old.credentialId }
          : { credentialId: randomUUID() }),
      };
    });
  }
  const defaultProviderId =
    input.defaultProviderId === undefined
      ? current.defaultProviderId
      : input.defaultProviderId;
  if (
    typeof defaultProviderId !== "string" ||
    !providers.some((p) => p.id === defaultProviderId)
  )
    throw Error("Invalid default provider");
  if (
    input.chat !== undefined &&
    providers.find((p) => p.id === defaultProviderId)?.service
  )
    throw Error("Use native provider settings");
  if (input.chat !== undefined)
    providers = providers.map((p) =>
      p.id === defaultProviderId
        ? { ...p, ...patchEndpoint(p, input.chat) }
        : p,
    );
  const updates: [string, string][] = [
    ["providers", JSON.stringify({ providers, defaultProviderId })],
  ];
  if (input.embedding !== undefined)
    updates.push([
      "embedding",
      JSON.stringify(patchEndpoint(loadEmbeddingConfig(), input.embedding)),
    ]);
  const db = appDatabase();
  try {
    db.exec("BEGIN");
    for (const [kind, value] of updates)
      db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
        kind,
        value,
      );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  return publicSettings();
}

// Rotate account identity before login so admitted runs never silently switch accounts.
export function rotateProviderCredential(id: string): string {
  const saved = loadProviders();
  const p = saved.providers.find((p) => p.id === id);
  if (!p) throw Error("Unknown provider");
  p.credentialId = randomUUID();
  const db = appDatabase();
  try {
    db.prepare("UPDATE settings SET value=? WHERE kind='providers'").run(
      JSON.stringify(saved),
    );
  } finally {
    db.close();
  }
  return p.credentialId;
}
