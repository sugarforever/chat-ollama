import { McpService } from '~/server/utils/mcp'

export default defineEventHandler(async (event) => {
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
