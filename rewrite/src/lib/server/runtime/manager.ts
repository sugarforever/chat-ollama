import type { McpConfig } from "../mcp/client";
import type { RuntimeTool } from "../mcp/tools";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationConfig } from "../../contracts";
import { openCatalogue } from "../db";
import { ApiError, validateConversationId } from "../errors";
import {
  openAgentSession,
  type AgentSession,
  type ChatEndpointConfig,
} from "./session";
export function createSessionManager(options: {
  directory: string;
  endpoint: ChatEndpointConfig;
  loadEndpoint?: () => ChatEndpointConfig;
  mcpConfigs?: McpConfig[];
  loadMcpConfigs?: () => McpConfig[];
  tools?: RuntimeTool[];
  createTools?: (
    config: ConversationConfig,
  ) => RuntimeTool[] | Promise<RuntimeTool[]>;
}) {
  const sessions = new Map<string, Promise<AgentSession>>();
  let closed = false;
  const catalogue = mkdir(options.directory, { recursive: true }).then(() =>
    openCatalogue(join(options.directory, "catalogue.sqlite")),
  );
  async function openSession(id: string): Promise<AgentSession> {
    if (closed) throw new Error("Runtime is closed");
    validateConversationId(id);
    const existing = sessions.get(id);
    if (existing) return existing;
    const opening = (async () => {
      const db = await catalogue;
      let row = db.get(id);
      // Internal explicit creation for runtime consumers; HTTP reads use getSession.
      if (!row) {
        db.insert(id, {
          modelId: options.endpoint.modelId,
          knowledgeBaseIds: [],
          mcpServerIds: [],
        });
        row = db.get(id)!;
      }
      const endpointFile = join(options.directory, `${id}.endpoint.json`);
      const initial = existsSync(endpointFile)
        ? JSON.parse(readFileSync(endpointFile, "utf8"))
        : { ...options.endpoint, modelId: row.config.modelId };
      const mcpFile = join(options.directory, `${id}.mcp.json`);
      const hasManifest = existsSync(
        join(options.directory, `${id}.sqlite.mcp-tools.json`),
      );
      const mcpConfigs: McpConfig[] =
        existsSync(mcpFile) && hasManifest
          ? JSON.parse(readFileSync(mcpFile, "utf8"))
          : (options.loadMcpConfigs?.() ?? options.mcpConfigs ?? []).filter(
              (c) => row!.config.mcpServerIds.includes(c.id),
            );
      if (!existsSync(mcpFile) || !hasManifest)
        writeFileSync(mcpFile, JSON.stringify(mcpConfigs), { mode: 0o600 });
      const session = await openAgentSession(
        id,
        join(options.directory, `${id}.sqlite`),
        initial,
        options.loadEndpoint
          ? () => {
              const endpoint = options.loadEndpoint!();
              writeFileSync(`${endpointFile}.tmp`, JSON.stringify(endpoint), {
                mode: 0o600,
              });
              // Atomic replacement keeps the previous complete snapshot if killed mid-write.
              renameSync(`${endpointFile}.tmp`, endpointFile);
              return endpoint;
            }
          : undefined,
        {
          mcpServerIds: row.config.mcpServerIds,
          mcpConfigs,
          tools: [
            ...(options.tools ?? []),
            ...(await (options.createTools?.(row.config) ?? [])),
          ],
          loadMcpConfigs: options.loadMcpConfigs
            ? () => {
                const next = options.loadMcpConfigs!().filter((c) =>
                  row!.config.mcpServerIds.includes(c.id),
                );
                writeFileSync(`${mcpFile}.tmp`, JSON.stringify(next), {
                  mode: 0o600,
                });
                renameSync(`${mcpFile}.tmp`, mcpFile);
                return next;
              }
            : undefined,
        },
      );
      db.ready(id);
      return session;
    })();
    sessions.set(id, opening);
    void opening.catch(() => {
      if (sessions.get(id) === opening) sessions.delete(id);
    });
    return opening;
  }
  return {
    openSession,
    async createConversation(config: ConversationConfig) {
      const selected = options.loadMcpConfigs?.() ?? options.mcpConfigs ?? [];
      if (
        config.mcpServerIds.some(
          (id) => !selected.some((server) => server.id === id),
        )
      )
        throw new ApiError(400, "INVALID_INPUT", "Unknown MCP server");
      const id = randomUUID();
      validateConversationId(id);
      // Catalogue intent precedes session creation; startup completes interrupted creation.
      (await catalogue).insert(id, config);
      await openSession(id);
      return { id };
    },
    async getSession(id: string) {
      validateConversationId(id);
      if (!(await catalogue).get(id))
        throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      return openSession(id);
    },
    async listConversations() {
      return (await catalogue)
        .list()
        .map(({ id, config, createdAt }) => ({ id, config, createdAt }));
    },
    async resume() {
      for (const row of (await catalogue).list()) {
        try {
          await openSession(row.id);
        } catch (error) {
          // A server unavailable during initial discovery must not make settings
          // inaccessible. Opening that conversation still returns its actionable error.
          if (!(error instanceof ApiError && error.code === "MCP_CONNECTION"))
            throw error;
        }
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      const opened = await Promise.allSettled(sessions.values());
      await Promise.all(
        opened
          .filter((x) => x.status === "fulfilled")
          .map((x) => x.value.close()),
      );
      sessions.clear();
      (await catalogue).close();
    },
  };
}
