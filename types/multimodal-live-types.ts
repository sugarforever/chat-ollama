import { Content, GenerativeContentBlob, Part } from "@google/generative-ai"

export interface StreamingLog {
    date: Date
    type: string
    message: string | object
}

export interface LiveConfig {
    model: string
    generationConfig?: {
        temperature?: number
        topP?: number
        topK?: number
    }
    tools?: any[]
}

export interface SetupMessage {
    setup: LiveConfig
}

export interface RealtimeInputMessage {
    realtimeInput: {
        mediaChunks: GenerativeContentBlob[]
    }
}

export interface ClientContentMessage {
    clientContent: {
        turns: Content[]
        turnComplete: boolean
    }
}

export interface ModelTurn {
    modelTurn: {
        parts: Part[]
    }
}

export interface ServerContent {
    interrupted?: boolean
    end_of_turn?: boolean
    modelTurn?: {
        parts: Part[]
    }
}

export interface ToolCall {
    name: string
    arguments: string
    call_id: string
}

export interface ToolCallCancellation {
    call_id: string
}

export interface ToolResponseMessage {
    toolResponse: {
        call_id: string
        output: string
    }
}

export interface LiveIncomingMessage {
    serverContent?: ServerContent
    toolCall?: ToolCall
    toolCallCancellation?: ToolCallCancellation
    setupComplete?: boolean
}

export function isServerContentMessage(msg: LiveIncomingMessage): boolean {
    return 'serverContent' in msg
}

export function isToolCallMessage(msg: LiveIncomingMessage): boolean {
    return 'toolCall' in msg
}

export function isToolCallCancellationMessage(msg: LiveIncomingMessage): boolean {
    return 'toolCallCancellation' in msg
}

export function isSetupCompleteMessage(msg: LiveIncomingMessage): boolean {
    return 'setupComplete' in msg
}

export function isInterrupted(content: ServerContent): boolean {
    return content.interrupted === true
}

export function isTurnComplete(content: ServerContent): boolean {
    return content.end_of_turn === true
}

export function isModelTurn(content: ServerContent): boolean {
    return 'modelTurn' in content
}
