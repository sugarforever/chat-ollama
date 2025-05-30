import { McpService } from '~/server/utils/mcp'

export default defineEventHandler(async (event) => {
    const mcpService = new McpService()

    try {
        const id = parseInt(getRouterParam(event, 'id') || '0')

        if (!id || isNaN(id)) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Invalid server ID'
            })
        }

        const result = await mcpService.deleteServer(id)

        if (result.success) {
            return {
                success: true,
                message: 'Server deleted successfully'
            }
        } else {
            throw createError({
                statusCode: 400,
                statusMessage: result.errors?.join(', ') || 'Failed to delete server'
            })
        }
    } catch (error: any) {
        console.error('Failed to delete MCP server:', error)

        if (error.statusCode) {
            throw error
        }

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to delete MCP server'
        })
    } finally {
        await mcpService.close()
    }
})
