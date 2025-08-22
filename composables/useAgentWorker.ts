import type { ChatMessage } from '~/types/chat'

interface AgentRequestData {
    instruction: string
    prompt: string
    models?: string[]
}

export type AgentWorkerReceivedMessage = {
    type: 'request'
    uid: number
    conversationRoundId: string
    data: AgentRequestData
    headers: Record<string, any>
} | {
    type: 'abort'
    uid?: number
}

export type AgentWorkerSendMessage = {
    uid: number
    id: string
} & (
        | { type: 'message', data: { messageType: string, content: string, name?: string, tool_call_id?: string, conversationRoundId: string, timestamp: number, isUpdate?: boolean } }
        | { type: 'error', message: string }
        | { type: 'complete' }
        | { type: 'abort' }
    )

type Handler = (data: AgentWorkerSendMessage) => void

export function useAgentWorker() {
    const handlers: Handler[] = []
    const abortControllers = new Map<number, AbortController>()

    async function sendAgentRequest(uid: number, conversationRoundId: string, data: AgentRequestData, headers: Record<string, any>) {
        const controller = new AbortController()
        abortControllers.set(uid, controller)

        try {
            const response = await fetch('/api/agents/1', {
                method: 'POST',
                body: JSON.stringify({ ...data, conversationRoundId }),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            })

            if (response.status !== 200) {
                const errorMessage = `Status Code ${response.status}${' - ' + response.statusText}`
                handlers.forEach(h => h({ uid, id: String(uid), type: 'error', message: errorMessage }))
                return
            }

            if (response.body) {
                const reader = response.body.getReader()
                let buffer = ''

                while (true) {
                    const { value, done } = await reader.read().catch((err: any) => {
                        if (err.name !== 'AbortError') {
                            throw err
                        }
                        return { done: true, value: undefined }
                    })

                    if (done) break

                    const chunk = new TextDecoder().decode(value)
                    buffer += chunk

                    // Process complete JSON lines
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || '' // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const messageData = JSON.parse(line)
                                handlers.forEach(h => h({
                                    uid,
                                    id: messageData.id,
                                    type: 'message',
                                    data: {
                                        messageType: messageData.type,
                                        content: messageData.content,
                                        name: messageData.name,
                                        tool_call_id: messageData.tool_call_id,
                                        conversationRoundId: messageData.conversationRoundId,
                                        timestamp: messageData.timestamp,
                                        isUpdate: messageData.isUpdate
                                    }
                                }))
                            } catch (e) {
                                console.error('Failed to parse message data:', e, line)
                            }
                        }
                    }
                }

                handlers.forEach(h => h({ uid, id: String(uid), type: 'complete' }))
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                handlers.forEach(h => h({
                    uid,
                    id: String(uid),
                    type: 'error',
                    message: error.message || 'Unknown error occurred'
                }))
            }
        } finally {
            abortControllers.delete(uid)
        }
    }

    function sendMessage(data: AgentWorkerReceivedMessage) {
        if (data.type === 'request') {
            sendAgentRequest(data.uid, data.conversationRoundId, data.data, data.headers)
        } else if (data.type === 'abort') {
            if (data.uid) {
                const controller = abortControllers.get(data.uid)
                if (controller) {
                    controller.abort()
                    abortControllers.delete(data.uid)
                    handlers.forEach(h => h({ uid: data.uid!, id: String(data.uid!), type: 'abort' }))
                }
            } else {
                // Abort all requests
                abortControllers.forEach((controller, uid) => {
                    controller.abort()
                    handlers.forEach(h => h({ uid, id: String(uid), type: 'abort' }))
                })
                abortControllers.clear()
            }
        }
    }

    function onReceivedMessage(handler: Handler) {
        handlers.push(handler)
    }

    if (getCurrentScope()) {
        onScopeDispose(() => {
            // Cleanup all active requests
            abortControllers.forEach(controller => controller.abort())
            abortControllers.clear()
            handlers.length = 0
        })
    }

    return { sendMessage, onReceivedMessage }
}
