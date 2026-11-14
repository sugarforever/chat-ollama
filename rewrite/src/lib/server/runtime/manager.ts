import type { McpConfig } from "../mcp/client";
import type { RuntimeTool } from "../mcp/tools";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ConversationConfig, ProviderSelection } from "../../contracts";
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
  resolveEndpoint?: (selection: ProviderSelection) => ChatEndpointConfig;
  defaultProviderId?: () => string;
  mcpConfigs?: McpConfig[];
  loadMcpConfigs?: () => McpConfig[];
  loadSkillContext?: (config: ConversationConfig) => string;
  tools?: RuntimeTool[];
  createTools?: (
    config: ConversationConfig,
  ) => RuntimeTool[] | Promise<RuntimeTool[]>;
}) {
  const sessions = new Map<string, Promise<AgentSession>>();
  let closed = false;
  const catalogue = mkdir(options.directory, { recursive: true }).then(() => {
    const db = openCatalogue(join(options.directory, "catalogue.sqlite"));
    // One-time upgrade: legacy records are pinned, never tied to changing defaults.
    if (options.resolveEndpoint)
      for (const row of db.list()) {
        if (!row.config.providerId)
          db.configure(row.id, { ...row.config, providerId: "legacy" });
      }
    return db;
  });
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
          ...(options.defaultProviderId
            ? { providerId: options.defaultProviderId() }
            : {}),
          modelId: options.endpoint.modelId,
          knowledgeBaseIds: [],
          mcpServerIds: [],
        });
        row = db.get(id)!;
      }
      const endpointFile = join(options.directory, `${id}.endpoint.json`);
      const currentConfig = () => db.get(id)!.config;
      const selectedEndpoint = () => {
        const config = currentConfig();
        return options.resolveEndpoint
          ? options.resolveEndpoint({
              providerId: config.providerId!,
              modelId: config.modelId,
            })
          : {
              ...(options.loadEndpoint?.() ?? options.endpoint),
              modelId: config.modelId,
            };
      };
      let initial: ChatEndpointConfig;
      if (existsSync(endpointFile))
        initial = JSON.parse(readFileSync(endpointFile, "utf8"));
      else {
        try {
          initial = selectedEndpoint();
        } catch (error) {
          // No captured run exists. Keep idle history readable and allow selection repair.
          if (
            !(error instanceof ApiError && error.code === "PROVIDER_NOT_FOUND")
          )
            throw error;
          initial = { ...options.endpoint, modelId: row.config.modelId };
        }
      }
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
        options.loadEndpoint || options.resolveEndpoint
          ? () => {
              const endpoint = selectedEndpoint();
              writeFileSync(`${endpointFile}.tmp`, JSON.stringify(endpoint), {
                mode: 0o600,
              });
              // Atomic replacement keeps the previous complete snapshot if killed mid-write.
              renameSync(`${endpointFile}.tmp`, endpointFile);
              return endpoint;
            }
          : undefined,
        {
          selection: options.resolveEndpoint
            ? () => {
                const config = currentConfig();
                return {
                  providerId: config.providerId!,
                  modelId: config.modelId,
                };
              }
            : undefined,
          loadSkillContext: options.loadSkillContext
            ? () => options.loadSkillContext!(currentConfig())
            : undefined,
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
      if (options.resolveEndpoint) {
        config = {
          ...config,
          providerId: config.providerId ?? options.defaultProviderId!(),
        };
        options.resolveEndpoint({
          providerId: config.providerId!,
          modelId: config.modelId,
        });
      }
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
    async getSkillExclusions(id: string) {
      validateConversationId(id);
      const row = (await catalogue).get(id);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      return row.config.excludedSkillIds ?? [];
    },
    async setSkillExclusions(id: string, excludedSkillIds: unknown) {
      validateConversationId(id);
      if (
        !Array.isArray(excludedSkillIds) || excludedSkillIds.length > 1000 ||
        !excludedSkillIds.every(value => typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
      ) throw new ApiError(400, "INVALID_INPUT", "Invalid skill exclusions");
      const db = await catalogue;
      const row = db.get(id);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      const opened = sessions.get(id);
      if (opened) {
        const snapshot = await (await opened).snapshot();
        if (["running", "cancelling"].includes(snapshot.status) || snapshot.queue?.length)
          throw new ApiError(409, "BUSY", "Wait for the current run and queued messages");
      }
      const excluded = [...new Set(excludedSkillIds.map(value => value.toLowerCase()))] as string[];
      db.configure(id, { ...db.get(id)!.config, excludedSkillIds: excluded });
      return excluded;
    },
    async selectModel(id: string, selection: ProviderSelection) {
      validateConversationId(id);
      const db = await catalogue;
      const row = db.get(id);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
      if (
        !selection ||
        typeof selection.providerId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(selection.providerId) ||
        typeof selection.modelId !== "string" ||
        !selection.modelId.trim() ||
        selection.modelId.length > 200
      )
        throw new ApiError(400, "INVALID_INPUT", "Invalid selection");
      if (!options.resolveEndpoint)
        throw new ApiError(400, "INVALID_INPUT", "Providers are unavailable");
      options.resolveEndpoint(selection);
      db.configure(id, { ...row.config, ...selection });
      const session = await openSession(id);
      session.configurationChanged();
      return session.snapshot();
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
