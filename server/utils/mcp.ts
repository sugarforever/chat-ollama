import { tool } from "@langchain/core/tools"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { DynamicStructuredTool } from "@langchain/core/tools"
import fs from 'fs'
import path from 'path'
import zodToJsonSchema from 'zod-to-json-schema'
interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export class McpService {
  async listTools(): Promise<any[]> {
    // Load the MCP servers from the .mcp-servers.json file
    let mcpConfigPath = path.join(process.cwd(), '.mcp-servers.json')
    if (process.env.MCP_SERVERS_CONFIG_PATH !== undefined) {
      mcpConfigPath = process.env.MCP_SERVERS_CONFIG_PATH
    }
    console.log("Loading MCP servers from ", mcpConfigPath)

    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'))

    const allTools: any[] = []
    for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
      console.log("Server name: ", serverName)
      console.log("Server config: ", serverConfig)

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env
      })

      const serverTools = await this.getToolsFromTransport(transport)
      allTools.push(...serverTools)
    }

    return allTools
  }

  private async getToolsFromTransport(transport: StdioClientTransport): Promise<any[]> {
    const client = new Client({
      name: "chatollama-client",
      version: "1.0.0",
    }, {
      capabilities: {}
    })

    await client.connect(transport)

    const tools = await client.listTools()
    const toolsMap: Record<string, DynamicStructuredTool<any>> = {}

    return tools.tools.map((t) => {
      console.log(`Tool ${t.name}: `, t.inputSchema)
      const _tool = tool(
        async (obj) => {
          const result = await client.callTool({
            name: t.name,
            arguments: obj
          })
          return result
        },
        {
          name: t.name,
          description: t.description,
          schema: t.inputSchema,
        }
      )

      _tool.mcpSchema = t.inputSchema

      toolsMap[t.name] = _tool
      return _tool
    })
  }
}
