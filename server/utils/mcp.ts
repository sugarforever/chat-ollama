import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { type StructuredToolInterface } from "@langchain/core/tools"
import { loadMcpTools, MultiServerMCPClient } from '@langchain/mcp-adapters'
import fs from 'fs'
import path from 'path'
interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export class McpService {

  private mcpClient: MultiServerMCPClient | null = null

  async listTools(): Promise<StructuredToolInterface[]> {
    // Load the MCP servers from the .mcp-servers.json file
    let mcpConfigPath = path.join(process.cwd(), '.mcp-servers.json')
    if (process.env.MCP_SERVERS_CONFIG_PATH !== undefined) {
      mcpConfigPath = process.env.MCP_SERVERS_CONFIG_PATH
    }
    console.log("Loading MCP servers from ", mcpConfigPath)

    if (!fs.existsSync(mcpConfigPath)) {
      return []
    }

    try {
      this.mcpClient = MultiServerMCPClient.fromConfigFile(mcpConfigPath)
      await this.mcpClient.initializeConnections()
      return await this.mcpClient.getTools()
    } catch (error) {
      console.error("Failed to parse MCP config file:", error)
      return []
    }
  }

  async close() {
    if (this.mcpClient) {
      await this.mcpClient.close()
    }
  }

  private async getToolsFromTransport(serverName: string, transport: StdioClientTransport): Promise<StructuredToolInterface[]> {
    const client = new Client({
      name: "chatollama-client",
      version: "1.0.0",
    }, {
      capabilities: {}
    })

    await client.connect(transport)
    return await loadMcpTools(serverName, client)
  }
}
