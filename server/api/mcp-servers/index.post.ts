import { McpService } from '~/server/utils/mcp'
import { McpServerCreateInput } from '~/server/types/mcp'
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
    const body = await readBody(event) as McpServerCreateInput

    const result = await mcpService.createServer(body)

    if (result.success) {
      return {
        success: true,
        data: result.server
      }
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: result.errors?.join(', ') || 'Failed to create server'
      })
    }
  } catch (error: any) {
    console.error('Failed to create MCP server:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create MCP server'
    })
  } finally {
    await mcpService.close()
  }
})
