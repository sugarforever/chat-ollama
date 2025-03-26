import Dexie, { type Table } from 'dexie'

export interface ChatSession {
    id?: number
    title: string
    createTime: number
    updateTime: number
    model?: string
    modelFamily?: string
    models?: string[]
    instructionId?: number
    knowledgeBaseId?: number
    attachedMessagesCount: number
    isTop: number
}

export interface ChatHistory {
    id?: number
    sessionId: number
    message: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    messageType: 'string' | 'array'
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
    }>,
    toolResult: boolean,
    toolCallId?: string
}

export class MySubClassedDexie extends Dexie {
    // 'chatHistories' is added by dexie when declaring the stores()
    // We just tell the typing system this is the case
    chatHistories!: Table<ChatHistory>

    chatSessions!: Table<ChatSession>

    constructor() {
        super('chat-ollama')
        this.version(3).stores({
            chatSessions: '++id, updateTime',
            chatHistories: '++id, sessionId', // Primary key and indexed props
        })

        // Add migration for existing records
        this.version(3).upgrade(tx => {
            return tx.table('chatHistories').toCollection().modify(history => {
                if (!history.messageType) {
                    history.messageType = 'string'
                }
            })
        })
    }
}

export const clientDB = new MySubClassedDexie()
