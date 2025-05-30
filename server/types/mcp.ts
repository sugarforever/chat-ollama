export interface TransportConfig {
    name: string
    requiredFields: string[]
    optionalFields: string[]
}

export const TRANSPORT_CONFIGS: Record<string, TransportConfig> = {
    stdio: {
        name: 'stdio',
        requiredFields: ['command', 'args'],
        optionalFields: ['env']
    },
    sse: {
        name: 'sse',
        requiredFields: ['url'],
        optionalFields: ['env']
    },
    'streamable-http': {
        name: 'streamable-http',
        requiredFields: ['url'],
        optionalFields: ['env']
    }
}

export const SUPPORTED_TRANSPORTS = {
    STDIO: 'stdio',
    SSE: 'sse',
    STREAMABLE_HTTP: 'streamable-http'
} as const

export type TransportType = typeof SUPPORTED_TRANSPORTS[keyof typeof SUPPORTED_TRANSPORTS]

export interface McpServerConfig {
    id?: number
    name: string
    transport: string
    command?: string
    args?: string
    url?: string
    env?: Record<string, string>
    enabled?: boolean
}

export interface McpServerCreateInput {
    name: string
    transport: string
    command?: string
    args?: string
    url?: string
    envVars?: Array<{ key: string; value: string }>
    enabled?: boolean
}

export interface McpServerUpdateInput {
    name?: string
    transport?: string
    command?: string
    args?: string
    url?: string
    envVars?: Array<{ key: string; value: string }>
    enabled?: boolean
}

// Validation functions
export const validateTransport = (transport: string): transport is TransportType => {
    return Object.values(SUPPORTED_TRANSPORTS).includes(transport as TransportType)
}

export const isKnownTransport = (transport: string): boolean => {
    return validateTransport(transport) || transport in TRANSPORT_CONFIGS
}

export const validateMcpServerConfig = (config: McpServerCreateInput): string[] => {
    const errors: string[] = []

    if (!config.name?.trim()) {
        errors.push('Server name is required')
    }

    if (!config.transport?.trim()) {
        errors.push('Transport type is required')
    }

    const transportConfig = TRANSPORT_CONFIGS[config.transport]
    if (!transportConfig) {
        errors.push(`Unsupported transport type: ${config.transport}`)
        return errors
    }

    // Check required fields for the transport type
    for (const field of transportConfig.requiredFields) {
        if (field === 'command' && !config.command?.trim()) {
            errors.push('Command is required for stdio transport')
        }
        if (field === 'args' && !config.args?.trim()) {
            errors.push('Args are required for stdio transport')
        }
        if (field === 'url' && !config.url?.trim()) {
            errors.push(`URL is required for ${config.transport} transport`)
        }
    }

    // Validate URL format if provided
    if (config.url) {
        try {
            new URL(config.url)
        } catch {
            errors.push('Invalid URL format')
        }
    }

    return errors
}

// Convert database record to config format
export const dbRecordToConfig = (server: any): McpServerConfig => {
    const config: McpServerConfig = {
        id: server.id,
        name: server.name,
        transport: server.transport,
        enabled: server.enabled
    }

    if (server.command) config.command = server.command
    if (server.args) config.args = server.args
    if (server.url) config.url = server.url

    // Convert env vars array to object
    if (server.envVars && server.envVars.length > 0) {
        config.env = server.envVars.reduce((acc: Record<string, string>, envVar: any) => {
            acc[envVar.key] = envVar.value || ''
            return acc
        }, {})
    }

    return config
}
