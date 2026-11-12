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
type Provider = ChatEndpointConfig & { id: string; name: string };
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
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    modelId: selection.modelId,
  };
}
export const loadChatConfig = () => {
  const saved = loadProviders();
  const provider = saved.providers.find(
    (p) => p.id === saved.defaultProviderId,
  )!;
  return {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    modelId: provider.modelId,
  };
};
export const loadEmbeddingConfig = () => load("embedding");
export function publicSettings() {
  const redact = ({ apiKey, ...value }: ChatEndpointConfig) => ({
    ...value,
    hasApiKey: !!apiKey,
  });
  const saved = loadProviders();
  return {
    // Compatibility for existing clients. This alias always edits the default provider.
    chat: redact(loadChatConfig()),
    embedding: redact(loadEmbeddingConfig()),
    providers: saved.providers.map((p) => redact(p) as PublicProvider),
    defaultProviderId: saved.defaultProviderId,
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
        typeof p.baseUrl !== "string" ||
        typeof p.modelId !== "string"
      )
        throw Error("Invalid provider");
      ids.add(p.id);
      const old = current.providers.find((old) => old.id === p.id);
      return {
        ...patchEndpoint(
          { baseUrl: "", modelId: "", apiKey: old?.apiKey ?? "" },
          p,
        ),
        id: p.id,
        name: p.name.trim(),
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
