import type { ChatMessage } from '~/types/chat'

interface AgentRequestData {
    instruction: string
    prompt: string
}

export type AgentWorkerReceivedMessage = {
    type: 'request'
    uid: number
    data: AgentRequestData
    headers: Record<string, any>
} | {
    type: 'abort'
    uid?: number
}

export type AgentWorkerSendMessage = {
    uid: number
    id: number
} & (
        | { type: 'message', data: { content: string } }
        | { type: 'error', message: string }
        | { type: 'complete' }
        | { type: 'abort' }
    )

type Handler = (data: AgentWorkerSendMessage) => void

export function useAgentWorker() {
    const handlers: Handler[] = []
    const abortControllers = new Map<number, AbortController>()

    async function sendAgentRequest(uid: number, data: AgentRequestData, headers: Record<string, any>) {
        const controller = new AbortController()
        abortControllers.set(uid, controller)

        try {
            const response = await fetch('/api/agents/1', {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            })

            if (response.status !== 200) {
                const errorMessage = `Status Code ${response.status}${' - ' + response.statusText}`
                handlers.forEach(h => h({ uid, id: uid, type: 'error', message: errorMessage }))
                return
            }

            if (response.body) {
                const reader = response.body.getReader()
                let content = ''

                while (true) {
                    const { value, done } = await reader.read().catch((err: any) => {
                        if (err.name !== 'AbortError') {
                            throw err
                        }
                        return { done: true, value: undefined }
                    })

                    if (done) break

                    const chunk = new TextDecoder().decode(value)
                    content += chunk

                    // Send incremental updates
                    handlers.forEach(h => h({
                        uid,
                        id: uid,
                        type: 'message',
                        data: { content }
                    }))
                }

                handlers.forEach(h => h({ uid, id: uid, type: 'complete' }))
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                handlers.forEach(h => h({
                    uid,
                    id: uid,
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
            sendAgentRequest(data.uid, data.data, data.headers)
        } else if (data.type === 'abort') {
            if (data.uid) {
                const controller = abortControllers.get(data.uid)
                if (controller) {
                    controller.abort()
                    abortControllers.delete(data.uid)
                    handlers.forEach(h => h({ uid: data.uid!, id: data.uid!, type: 'abort' }))
                }
            } else {
                // Abort all requests
                abortControllers.forEach((controller, uid) => {
                    controller.abort()
                    handlers.forEach(h => h({ uid, id: uid, type: 'abort' }))
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
