export interface ChatMessage {
  id?: number
  role: 'system' | 'assistant' | 'user'
  model: string,
  contentType: 'string' | 'array',
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  type?: 'loading' | 'canceled' | 'error'
  startTime: number
  endTime: number
  relevantDocs?: RelevantDocument[]
  toolResult: boolean
  toolCallId?: string
}
