import { McpService } from '~/server/utils/mcp'
import { requireAdminIfAclEnabled } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Check if MCP feature is enabled
  if (!isMcpEnabled()) {
    setResponseStatus(event, 403, 'MCP feature is disabled')
    return { error: 'MCP feature is disabled' }
  }

  // Require admin privileges for MCP server management (if ACL is enabled)
  requireAdminIfAclEnabled(event)

  const mcpService = new McpService()

  try {
    const servers = await mcpService.getAllServers()
    return {
      success: true,
      data: servers
    }
  } catch (error) {
    console.error('Failed to fetch MCP servers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch MCP servers'
    })
  } finally {
    await mcpService.close()
  }
})
