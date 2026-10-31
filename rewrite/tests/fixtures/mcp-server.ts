import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { z } from "zod";
const server = new McpServer({ name: "fixture", version: "1" });
server.registerTool(
  "echo",
  { inputSchema: { text: z.string() } },
  async ({ text }) => ({
    content: [{ type: "text", text: (process.env.ECHO_PREFIX ?? "") + text }],
  }),
);
server.registerTool("effect", { inputSchema: {} }, async () => {
  appendFileSync(process.env.EFFECT_FILE!, "effect\n");
  if (process.env.LOSE_CONNECTION) process.exit(0);
  await new Promise(() => {});
  return { content: [] };
});
if (process.env.MCP_HTTP) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    await transport.handleRequest(
      req,
      res,
      body ? JSON.parse(body) : undefined,
    );
  });
  http.listen(0, "127.0.0.1", () =>
    process.send?.({
      url: `http://127.0.0.1:${(http.address() as any).port}/mcp`,
    }),
  );
} else await server.connect(new StdioServerTransport());
