import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
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
function load(kind: "chat" | "embedding"): ChatEndpointConfig {
  const db = appDatabase();
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE kind=?")
      .get(kind) as { value: string } | undefined;
    return row
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
        };
  } finally {
    db.close();
  }
}
export const loadChatConfig = () => load("chat");
export const loadEmbeddingConfig = () => load("embedding");
export function publicSettings() {
  const redact = ({ apiKey, ...value }: ChatEndpointConfig) => ({
    ...value,
    hasApiKey: !!apiKey,
  });
  return {
    chat: redact(loadChatConfig()),
    embedding: redact(loadEmbeddingConfig()),
  };
}
export function saveSettings(input: Record<string, unknown>) {
  const updates: [string, string][] = [];
  for (const kind of ["chat", "embedding"] as const) {
    if (input[kind] === undefined) continue;
    const patch = input[kind];
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw Error("Invalid settings");
    const next = { ...load(kind) };
    for (const key of ["baseUrl", "modelId", "apiKey"] as const) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (
        typeof value !== "string" ||
        value.length > 8192 ||
        (key !== "apiKey" && !value.trim())
      )
        throw Error("Invalid settings");
      next[key] = value;
    }
    const url = new URL(next.baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error("Invalid endpoint");
    updates.push([kind, JSON.stringify(next)]);
  }
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
