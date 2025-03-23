export interface ChatMessage {
    id?: number
    role: 'system' | 'assistant' | 'user'
    model: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    type?: 'loading' | 'canceled' | 'error'
    startTime: number
    endTime: number
    relevantDocs?: RelevantDocument[]
    toolResult: boolean
    toolCallId?: string
}
