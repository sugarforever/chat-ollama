import { ApiError } from "../errors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
export type McpConfig =
  | {
      id: string;
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      id: string;
      transport: "http";
      url: string;
      headers?: Record<string, string>;
    };
export async function connectServer(config: McpConfig) {
  const client = new Client({ name: "chat-ollama", version: "1" });
  const transport =
    config.transport === "stdio"
      ? new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
          stderr: "ignore",
        })
      : new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        });
  try {
    await client.connect(transport);
  } catch {
    await transport.close();
    throw new ApiError(
      502,
      "MCP_CONNECTION",
      "Cannot connect MCP server; check address, command and authentication headers. OAuth setup is outside v1.",
    );
  }
  return {
    async listTools() {
      const tools = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools({ cursor });
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      return tools;
    },
    callTool: (
      name: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ) => client.callTool({ name, arguments: args }, undefined, { signal }),
    close: () => client.close(),
  };
}
export type McpConnection = Awaited<ReturnType<typeof connectServer>>;
