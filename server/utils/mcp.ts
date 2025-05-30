import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { type StructuredToolInterface } from "@langchain/core/tools"
import { loadMcpTools, MultiServerMCPClient } from '@langchain/mcp-adapters'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import {
  McpServerConfig,
  McpServerCreateInput,
  McpServerUpdateInput,
  validateMcpServerConfig,
  dbRecordToConfig,
  TRANSPORT_CONFIGS
} from '../types/mcp'

interface LegacyMcpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface LegacyMcpConfig {
  mcpServers: Record<string, LegacyMcpServerConfig>
}

export class McpService {
  private mcpClient: MultiServerMCPClient | null = null
  private prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }

  async listTools(): Promise<StructuredToolInterface[]> {
    try {
      // Try to load from database first
      const dbServers = await this.getAllServers()

      if (dbServers.length > 0) {
        console.log("Loading MCP servers from database")
        return await this.loadToolsFromDatabase(dbServers)
      } else {
        return []
      }
    } catch (error) {
      console.error("Failed to load MCP tools:", error)
      return []
    }
  }

  private async loadToolsFromDatabase(servers: McpServerConfig[]): Promise<StructuredToolInterface[]> {
    const enabledServers = servers.filter(server => server.enabled !== false)

    if (enabledServers.length === 0) {
      return []
    }

    // Convert database format to MultiServerMCPClient format
    const mcpConfig = this.convertToMcpClientConfig(enabledServers)
    console.log("MCP Config: ", mcpConfig)
    // Validate config before passing to MCP client
    if (!mcpConfig.servers || Object.keys(mcpConfig.servers).length === 0) {
      console.error("No valid MCP servers found in configuration")
      return []
    }

    try {
      this.mcpClient = new MultiServerMCPClient(mcpConfig.servers)
      await this.mcpClient.initializeConnections()
      return await this.mcpClient.getTools()
    } catch (error) {
      console.error("Failed to initialize MCP client from database:", error)
      console.error("MCP Config that failed:", JSON.stringify(mcpConfig, null, 2))
      return []
    }
  }

  private async loadToolsFromJsonFile(): Promise<StructuredToolInterface[]> {
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

  private convertToMcpClientConfig(servers: McpServerConfig[]): any {
    const config: any = { servers: {} }

    for (const server of servers) {
      const serverConfig: any = {
        transport: server.transport
      }

      if (server.transport === 'stdio') {
        serverConfig.command = server.command
        // Convert args string back to array for MultiServerMCPClient
        serverConfig.args = server.args ? server.args.split(' ').filter(arg => arg.trim()) : []
      } else if (server.transport === 'sse' || server.transport === 'streamable-http') {
        serverConfig.url = server.url
      }

      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = {
          ...serverConfig.env,
          ...server.env,
          PATH: process.env.PATH
        }
      }

      config.servers[server.name] = serverConfig
    }

    console.log('MCP Client Config:', JSON.stringify(config, null, 2))
    return config
  }

  // CRUD Operations for MCP Servers

  async getAllServers(): Promise<McpServerConfig[]> {
    const servers = await this.prisma.mcpServer.findMany({
      include: {
        envVars: true
      },
      orderBy: {
        name: 'asc'
      }
    })

    return servers.map(dbRecordToConfig)
  }

  async getServerById(id: number): Promise<McpServerConfig | null> {
    const server = await this.prisma.mcpServer.findUnique({
      where: { id },
      include: {
        envVars: true
      }
    })

    return server ? dbRecordToConfig(server) : null
  }

  async getServerByName(name: string): Promise<McpServerConfig | null> {
    const server = await this.prisma.mcpServer.findUnique({
      where: { name },
      include: {
        envVars: true
      }
    })

    return server ? dbRecordToConfig(server) : null
  }

  async createServer(input: McpServerCreateInput): Promise<{ success: boolean; server?: McpServerConfig; errors?: string[] }> {
    // Validate input
    const validationErrors = validateMcpServerConfig(input)
    if (validationErrors.length > 0) {
      return { success: false, errors: validationErrors }
    }

    try {
      // Check if server with same name already exists
      const existing = await this.prisma.mcpServer.findUnique({
        where: { name: input.name }
      })

      if (existing) {
        return { success: false, errors: ['Server with this name already exists'] }
      }

      const server = await this.prisma.mcpServer.create({
        data: {
          name: input.name,
          transport: input.transport,
          command: input.command,
          args: input.args,
          url: input.url,
          enabled: input.enabled ?? true,
          envVars: {
            create: input.envVars?.map(env => ({
              key: env.key,
              value: env.value
            })) || []
          }
        },
        include: {
          envVars: true
        }
      })

      return { success: true, server: dbRecordToConfig(server) }
    } catch (error) {
      console.error('Failed to create MCP server:', error)
      return { success: false, errors: ['Failed to create server'] }
    }
  }

  async updateServer(id: number, input: McpServerUpdateInput): Promise<{ success: boolean; server?: McpServerConfig; errors?: string[] }> {
    try {
      // Check if server exists
      const existing = await this.prisma.mcpServer.findUnique({
        where: { id }
      })

      if (!existing) {
        return { success: false, errors: ['Server not found'] }
      }

      // Validate input if provided
      if (input.transport) {
        const validationInput: McpServerCreateInput = {
          name: input.name || existing.name,
          transport: input.transport,
          command: input.command || existing.command || undefined,
          args: input.args || existing.args || undefined,
          url: input.url || existing.url || undefined,
          envVars: input.envVars
        }

        const validationErrors = validateMcpServerConfig(validationInput)
        if (validationErrors.length > 0) {
          return { success: false, errors: validationErrors }
        }
      }

      // Check if name is being changed and conflicts with existing
      if (input.name && input.name !== existing.name) {
        const nameConflict = await this.prisma.mcpServer.findUnique({
          where: { name: input.name }
        })

        if (nameConflict) {
          return { success: false, errors: ['Server with this name already exists'] }
        }
      }

      // Update server and env vars
      const updateData: any = {}
      if (input.name !== undefined) updateData.name = input.name
      if (input.transport !== undefined) updateData.transport = input.transport
      if (input.command !== undefined) updateData.command = input.command
      if (input.args !== undefined) updateData.args = input.args
      if (input.url !== undefined) updateData.url = input.url
      if (input.enabled !== undefined) updateData.enabled = input.enabled

      const server = await this.prisma.mcpServer.update({
        where: { id },
        data: updateData,
        include: {
          envVars: true
        }
      })

      // Update env vars if provided
      if (input.envVars) {
        // Delete existing env vars
        await this.prisma.mcpServerEnvVar.deleteMany({
          where: { mcpServerId: id }
        })

        // Create new env vars
        await this.prisma.mcpServerEnvVar.createMany({
          data: input.envVars.map(env => ({
            mcpServerId: id,
            key: env.key,
            value: env.value
          }))
        })

        // Refetch server with updated env vars
        const updatedServer = await this.prisma.mcpServer.findUnique({
          where: { id },
          include: { envVars: true }
        })

        return { success: true, server: dbRecordToConfig(updatedServer!) }
      }

      return { success: true, server: dbRecordToConfig(server) }
    } catch (error) {
      console.error('Failed to update MCP server:', error)
      return { success: false, errors: ['Failed to update server'] }
    }
  }

  async deleteServer(id: number): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const existing = await this.prisma.mcpServer.findUnique({
        where: { id }
      })

      if (!existing) {
        return { success: false, errors: ['Server not found'] }
      }

      await this.prisma.mcpServer.delete({
        where: { id }
      })

      return { success: true }
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
      return { success: false, errors: ['Failed to delete server'] }
    }
  }

  async toggleServer(id: number): Promise<{ success: boolean; server?: McpServerConfig; errors?: string[] }> {
    try {
      const existing = await this.prisma.mcpServer.findUnique({
        where: { id }
      })

      if (!existing) {
        return { success: false, errors: ['Server not found'] }
      }

      const server = await this.prisma.mcpServer.update({
        where: { id },
        data: { enabled: !existing.enabled },
        include: { envVars: true }
      })

      return { success: true, server: dbRecordToConfig(server) }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error)
      return { success: false, errors: ['Failed to toggle server'] }
    }
  }

  async close() {
    if (this.mcpClient) {
      await this.mcpClient.close()
    }
    await this.prisma.$disconnect()
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
