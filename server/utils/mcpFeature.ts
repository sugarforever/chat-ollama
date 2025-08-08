/**
 * Server-side utility to check if MCP feature is enabled
 */
export function isMcpEnabled(): boolean {
    const config = useRuntimeConfig()
    return config.mcpEnabled
}
