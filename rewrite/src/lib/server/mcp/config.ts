import { appDatabase } from "../settings";
import { ApiError } from "../errors";
import type { McpConfig } from "./client";
export function loadMcpServers(): McpConfig[] {
  const db = appDatabase();
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE kind='mcp'")
      .get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : [];
  } finally {
    db.close();
  }
}
export function publicMcpServers() {
  return loadMcpServers().map((config) =>
    config.transport === "stdio"
      ? {
          id: config.id,
          transport: config.transport,
          command: config.command,
          args: config.args,
          hasEnvironment: !!Object.keys(config.env ?? {}).length,
        }
      : {
          id: config.id,
          transport: config.transport,
          url: config.url,
          hasHeaders: !!Object.keys(config.headers ?? {}).length,
        },
  );
}
export function saveMcpServers(input: unknown) {
  const invalid = () => {
    throw new ApiError(400, "INVALID_INPUT", "Invalid MCP configuration");
  };
  if (!Array.isArray(input)) return invalid();
  const ids = new Set<string>();
  const configs: McpConfig[] = [];
  for (const value of input) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.id !== "string" ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(value.id) ||
      ids.has(value.id)
    )
      return invalid();
    ids.add(value.id);
    const strings = (v: unknown) =>
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v).every((x) => typeof x === "string");
    if (value.transport === "stdio") {
      if (
        typeof value.command !== "string" ||
        !value.command.trim() ||
        (value.args !== undefined &&
          (!Array.isArray(value.args) ||
            !value.args.every((x: unknown) => typeof x === "string"))) ||
        (value.env !== undefined && !strings(value.env))
      )
        return invalid();
      configs.push({
        id: value.id,
        transport: "stdio",
        command: value.command,
        args: value.args,
        env: value.env,
      });
    } else if (value.transport === "http") {
      try {
        const url = new URL(value.url);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          return invalid();
      } catch {
        return invalid();
      }
      if (value.headers !== undefined && !strings(value.headers))
        return invalid();
      configs.push({
        id: value.id,
        transport: "http",
        url: value.url,
        headers: value.headers,
      });
    } else return invalid();
  }
  const db = appDatabase();
  try {
    db.prepare("INSERT OR REPLACE INTO settings VALUES('mcp',?)").run(
      JSON.stringify(configs),
    );
  } finally {
    db.close();
  }
  return publicMcpServers();
}
