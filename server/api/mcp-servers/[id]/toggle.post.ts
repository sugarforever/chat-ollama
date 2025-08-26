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
    const id = parseInt(getRouterParam(event, 'id') || '0')

    if (!id || isNaN(id)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid server ID'
      })
    }

    const result = await mcpService.toggleServer(id)

    if (result.success) {
      return {
        success: true,
        data: result.server,
        message: `Server ${result.server?.enabled ? 'enabled' : 'disabled'} successfully`
      }
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: result.errors?.join(', ') || 'Failed to toggle server'
      })
    }
  } catch (error: any) {
    console.error('Failed to toggle MCP server:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to toggle MCP server'
    })
  } finally {
    await mcpService.close()
  }
})
