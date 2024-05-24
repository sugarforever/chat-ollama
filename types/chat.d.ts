export interface ChatMessage {
  id?: number
  role: 'system' | 'assistant' | 'user'
  model: string
  content: string
  type?: 'loading' | 'canceled' | 'error'
  timestamp: number
  relevantDocs?: RelevantDocument[]
}
