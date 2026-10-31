import { createHash } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { connectServer, type McpConfig, type McpConnection } from "./client";
// Only this adapter boundary depends on pi's executable tool type.
export type RuntimeTool = ToolRegistration;
export type McpDescriptor = { serverId: string; tool: Tool };
export function stableToolName(id: string, name: string) {
  return `mcp_${createHash("sha256")
    .update(JSON.stringify([id, name]))
    .digest("hex")
    .slice(0, 56)}`;
}
export async function createMcpTools(
  serverIds: string[],
  configs: McpConfig[],
  guard: {
    begin(name: string, callId: string): void;
    complete(): void;
    fail(): void;
  },
  cached?: McpDescriptor[],
) {
  const connections = new Map<string, McpConnection>();
  const close = async () => {
    await Promise.allSettled(
      [...connections.values()].map((connection) => connection.close()),
    );
  };
  const connection = async (id: string) => {
    let value = connections.get(id);
    if (!value) {
      const config = configs.find((c) => c.id === id);
      if (!config) throw Error(`Unknown MCP server ${id}`);
      value = await connectServer(config);
      connections.set(id, value);
    }
    return value;
  };
  try {
    const descriptors: McpDescriptor[] = cached ?? [];
    if (!cached)
      for (const id of new Set(serverIds))
        for (const tool of await (await connection(id)).listTools())
          descriptors.push({ serverId: id, tool });
    const tools: RuntimeTool[] = descriptors
      .filter((d) => serverIds.includes(d.serverId))
      .map(({ serverId: id, tool }) => ({
        name: stableToolName(id, tool.name),
        description: `${id}: ${tool.name}. ${tool.description || ""}`,
        parameters: Type.Unsafe(tool.inputSchema),
        replay: "unsafe",
        executionMode: "sequential",
        async execute(args, api, context) {
          // Mark first, including connection errors: never assume an external outcome.
          guard.begin(tool.name, api.callId);
          try {
            const result = await (
              await connection(id)
            ).callTool(
              tool.name,
              args as Record<string, unknown>,
              context.abortSignal,
            );
            guard.complete();
            return {
              output: [{ type: "text" as const, text: JSON.stringify(result) }],
              isError: Boolean(result.isError),
            };
          } catch {
            guard.fail();
            throw Error(
              "MCP outcome uncertain; acknowledge interruption before using MCP again",
            );
          }
        },
      }));
    return { tools, descriptors, close };
  } catch (error) {
    await close();
    throw error;
  }
}
