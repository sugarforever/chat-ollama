import { tool } from "@langchain/core/tools"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { useRuntimeConfig } from '#imports'

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
    console.log("Using runtime config for MCP servers")
    const runtimeConfig = useRuntimeConfig()
    const mcpConfig = { mcpServers: runtimeConfig.mcpServers }

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

    console.log("Tools: ", tools)

    const toolsMap: Record<string, DynamicStructuredTool<any>> = {}

    return tools.tools.map((t) => {
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

      toolsMap[t.name] = _tool
      return _tool
    })
  }
}
