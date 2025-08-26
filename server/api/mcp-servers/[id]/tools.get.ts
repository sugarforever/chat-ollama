import { McpService } from '~/server/utils/mcp'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { requireAdminIfAclEnabled } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check if MCP feature is enabled
  if (!isMcpEnabled()) {
    setResponseStatus(event, 403, 'MCP feature is disabled')
    return { error: 'MCP feature is disabled' }
  }

  // Require admin privileges for MCP server management (if ACL is enabled)
  requireAdminIfAclEnabled(event)

  const id = getRouterParam(event, 'id')
  const serverId = parseInt(id || '0')

  if (isNaN(serverId) || serverId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid server ID'
    })
  }

  const mcpService = new McpService()

  try {
    // Get the server configuration
    const server = await mcpService.getServerById(serverId)
    if (!server) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Server not found'
      })
    }

    // Only fetch tools for enabled servers
    if (!server.enabled) {
      return {
        success: true,
        data: {
          tools: [],
          enabled: false,
          message: 'Server is disabled'
        }
      }
    }

    // Try to fetch tools for this specific server
    try {
      const mcpConfig = McpService.convertToMcpClientConfig(server)
      console.log("MCP Config: ", mcpConfig)
      const mcpClient = new MultiServerMCPClient(mcpConfig.servers)

      await mcpClient.initializeConnections()
      const tools = await mcpClient.getTools()
      await mcpClient.close()

      return {
        success: true,
        data: {
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            schema: tool.schema
          })),
          enabled: true,
          serverName: server.name
        }
      }
    } catch (toolError) {
      console.error(`Failed to fetch tools for MCP server ${server.name}:`, toolError)

      return {
        success: false,
        error: `Failed to fetch tools: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
        data: {
          tools: [],
          enabled: true,
          serverName: server.name,
          connectionError: true
        }
      }
    }

  } catch (error) {
    console.error('Failed to fetch MCP server tools:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch MCP server tools'
    })
  } finally {
    await mcpService.close()
  }
})
