import Dexie, { type Table } from 'dexie'

export interface ChatSession {
  id?: number
  title: string
  createTime: number
  updateTime: number
  model?: string
  modelFamily?: string
  models: string[]
  instructionId?: number
  knowledgeBaseId?: number
  attachedMessagesCount: number
  isTop: number
}

export interface ChatHistory {
  id?: number
  sessionId: number
  message: string
  startTime: number
  endTime: number
  model: string
  role: 'user' | 'assistant'
  canceled: boolean
  failed: boolean
  instructionId?: number
  knowledgeBaseId?: number
  relevantDocs?: Array<{
    pageContent: string
    metadata: {
      blobType: string
      source: string
    }
  }>
}

export class MySubClassedDexie extends Dexie {
  // 'chatHistories' is added by dexie when declaring the stores()
  // We just tell the typing system this is the case
  chatHistories!: Table<ChatHistory>

  chatSessions!: Table<ChatSession>

  constructor() {
    super('chat-ollama')
    this.version(2).stores({
      chatSessions: '++id, updateTime',
      chatHistories: '++id, sessionId', // Primary key and indexed props
    })
  }
}

export const clientDB = new MySubClassedDexie()
