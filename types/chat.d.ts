export interface ToolCall {
    id: string
    name: string
    args: any
}

export interface ToolResult {
    tool_call_id: string
    content: string
}

export interface ChatMessage {
    id?: number
    role: 'system' | 'assistant' | 'user'
    model: string,
    contentType: 'string' | 'array' | 'tool',
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    type?: 'loading' | 'canceled' | 'error' | 'tool'
    startTime: number
    endTime: number
    relevantDocs?: RelevantDocument[]
    toolResult: boolean
    toolCallId: string
    toolCalls: ToolCall[]
    toolResults: ToolResult[]
    // Agent-specific properties
    messageType?: string
    toolName?: string
    additionalKwargs?: any
}
