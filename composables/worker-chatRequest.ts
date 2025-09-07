import type { SetRequired } from 'type-fest'
import type { ChatMessage } from '~/types/chat'
import type { clientDB, ChatHistory } from '~/composables/clientDB'

type RelevantDocument = Required<ChatHistory>['relevantDocs'][number]
type ResponseRelevantDocument = { type: 'relevant_documents', relevant_documents: RelevantDocument[] }
type ResponseMessage = {
  message: {
    role: string,
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
    type?: string,
    tool_use_id?: string,
    tool_calls?: Array<{ id: string, name: string, args: any }>,
    tool_results?: Array<{ tool_call_id: string, content: string }>
  }
}

interface RequestData {
  sessionId: number
  knowledgebaseId?: number
  /** format: `family::model` */
  model: string
  messages: Array<SetRequired<Partial<ChatMessage>, 'role' | 'content' | 'toolResult' | 'toolCallId'>>
  stream: boolean
  timestamp: number
  enableToolUsage?: boolean
}

export type WorkerReceivedMessage =
  | { type: 'request', uid: number, data: RequestData, headers: Record<string, any> }
  | { type: 'abort', uid?: number, sessionId: number }

export type WorkerSendMessage = { uid: number, sessionId: number, id: number, } & (
  | { type: 'message', data: ChatMessage }
  | { type: 'relevant_documents', data: ChatMessage }
  | { type: 'error', message: string }
  | { type: 'complete' }
  | { type: 'abort' }
)

const MODEL_FAMILY_SEPARATOR = '/'

let db: typeof clientDB
import('~/composables/clientDB').then(mod => {
  db = mod.clientDB
})

const abortHandlerMap = new Map<string /** sessionId:uid */, () => void>()

function sendMessageToMain(data: WorkerSendMessage) {
  postMessage(data)
}

function parseModelValue(val: string) {
  const [family, ...parts] = val.split(MODEL_FAMILY_SEPARATOR)
  return { family, name: parts.join(MODEL_FAMILY_SEPARATOR) }
}

async function chatRequest(uid: number, data: RequestData, headers: Record<string, any>) {
  /** indexedDB `id` */
  let id = -1
  let msgContent = ''
  const controller = new AbortController()

  abortHandlerMap.set(`${data.sessionId}:${uid}`, () => {
    controller.abort()
    updateToDB({ id, canceled: true, message: msgContent })
    sendMessageToMain({ uid, id, sessionId: data.sessionId, type: 'abort' })
  })

  const { family, name: model } = parseModelValue(data.model)

  const response = await fetch('/api/models/chat', {
    method: 'POST',
    body: JSON.stringify({
      knowledgebaseId: data.knowledgebaseId,
      model,
      family,
      messages: data.messages,
      stream: data.stream,
      enableToolUsage: data.enableToolUsage,
    }),
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  })

  if (response.status !== 200) {
    const { message: responseMessage } = await response.json()
    const errInfo = responseMessage || `Status Code ${response.status}${' - ' + response.statusText}`
    id = await addToDB({
      sessionId: data.sessionId,
      role: 'assistant',
      message: errInfo,
      messageType: 'string',
      model: data.model,
      knowledgeBaseId: data.knowledgebaseId,
      failed: true,
      canceled: false,
      startTime: data.timestamp,
      endTime: Date.now(),
      toolResult: false
    })
    sendMessageToMain({ uid, type: 'error', sessionId: data.sessionId, id, message: errInfo })
    sendMessageToMain({ id, uid, sessionId: data.sessionId, type: 'complete' })
  } else if (response.body) {
    const reader = response.body.getReader()
    const splitter = ' \n\n'
    let prevPart = ''
    const relevantDocs: RelevantDocument[] = []
    let toolCalls: Array<{ id: string, name: string, args: any }> = []
    let toolResults: Array<{ tool_call_id: string, content: string }> = []
    let t = Date.now()

    while (true) {
      const { value, done } = await reader.read().catch((err: any) => {
        if (err.name !== 'AbortError') {
          throw err
        }
        return { done: true, value: undefined }
      })
      if (done) break

      let chunk: string
      try {
        chunk = prevPart + new TextDecoder().decode(value)
      } catch (decodeError) {
        console.warn('Failed to decode chunk, skipping:', decodeError)
        continue
      }

      if (!chunk.includes(splitter)) {
        prevPart = chunk
        continue
      }

      // Split on the separator and handle the last part which might be incomplete
      const parts = chunk.split(splitter)
      prevPart = parts.pop() || '' // Keep the last part for next iteration

      for (const line of parts) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        try {
          const chatMessage = JSON.parse(trimmedLine) as ResponseMessage | ResponseRelevantDocument
          const isMessage = !('type' in chatMessage) && 'message' in chatMessage
          const isToolResult = isMessage && chatMessage.message.type === 'tool_result'

          if (isMessage && !isToolResult) {
            // Handle regular assistant message with potential tool calls/results
            const messageContent = chatMessage.message.content

            // Handle both string and multimodal array content
            if (Array.isArray(messageContent)) {
              msgContent = messageContent
            } else {
              // For streaming, each chunk contains the full message content so far
              // No need to accumulate - just replace with the latest content
              msgContent = messageContent || ''
            }

            // Accumulate tool calls and results
            if (chatMessage.message.tool_calls) {
              toolCalls = chatMessage.message.tool_calls
            }
            if (chatMessage.message.tool_results) {
              toolResults = chatMessage.message.tool_results
            }

            const result: ChatHistory = {
              role: 'assistant' as const,
              model: data.model,
              sessionId: data.sessionId,
              message: msgContent,
              messageType: Array.isArray(msgContent) ? 'array' : 'string',
              failed: false,
              canceled: false,
              startTime: data.timestamp,
              endTime: Date.now(),
              toolResult: false,
              toolCallId: undefined,
              toolCalls: toolCalls,
              toolResults: toolResults,
            }

            if (id === -1) {
              id = await addToDB(result)
            }
            // save message to DB after every 1s
            else if (Date.now() - t > 1000) {
              t = Date.now()
              updateToDB({
                id,
                message: msgContent,
                toolCalls: toolCalls,
                toolResults: toolResults
              })
            }

            sendMessageToMain({
              uid, type: 'message', sessionId: data.sessionId, id,
              data: {
                id,
                content: msgContent,
                contentType: Array.isArray(msgContent) ? 'array' : 'string',
                startTime: data.timestamp,
                endTime: Date.now(),
                role: 'assistant',
                model: data.model,
                toolResult: false,
                toolCallId: undefined,
                toolCalls: chatMessage.message.tool_calls || [],
                toolResults: chatMessage.message.tool_results || [],
              }
            })
          } else if ('type' in chatMessage && chatMessage.type === 'relevant_documents') {
            relevantDocs.push(...chatMessage.relevant_documents)
            sendMessageToMain({
              uid, type: 'relevant_documents', sessionId: data.sessionId, id,
              data: {
                id,
                content: msgContent,
                contentType: Array.isArray(msgContent) ? 'array' : 'string',
                startTime: data.timestamp,
                endTime: Date.now(),
                role: 'assistant',
                model: data.model,
                relevantDocs: chatMessage.relevant_documents,
                toolResult: false
              },
            })
          }
        } catch (parseError) {
          console.warn('Failed to parse JSON chunk:', {
            chunk: trimmedLine.substring(0, 200),
            length: trimmedLine.length,
            error: parseError instanceof Error ? parseError.message : parseError,
            errorType: parseError instanceof SyntaxError ? 'SyntaxError' : 'Unknown'
          })
          // Skip malformed JSON chunks but continue processing
          continue
        }
      }
    }

    await updateToDB({
      id,
      message: msgContent,
      toolCalls: toolCalls,
      toolResults: toolResults,
      relevantDocs: relevantDocs.map(el => {
        const pageContent = el.pageContent.slice(0, 200) + (el.pageContent.length > 200 ? '...' : '') // Avoid saving large-sized content
        return { ...el, pageContent }
      })
    })
    sendMessageToMain({ id, uid, sessionId: data.sessionId, type: 'complete' })
  }
  abortHandlerMap.delete(`${data.sessionId}:${uid}`)
}

async function addToDB(data: Omit<ChatHistory, 'id'>) {
  const messageType = Array.isArray(data.message) ? 'array' : 'string'
  return await db.chatHistories.add({
    ...data,
    messageType
  }) as number
}

async function updateToDB(data: SetRequired<Partial<ChatHistory>, 'id'>) {
  const updates: Partial<ChatHistory> = {
    relevantDocs: data.relevantDocs,
    canceled: data.canceled,
    failed: data.failed,
    endTime: Date.now(),
    toolCalls: data.toolCalls,
    toolResults: data.toolResults,
  }

  if (data.message !== undefined) {
    updates.message = data.message
    updates.messageType = Array.isArray(data.message) ? 'array' : 'string'
  }

  await db.chatHistories.where('id')
    .equals(data.id)
    .modify(updates)
}

self.addEventListener('message', (e: MessageEvent<WorkerReceivedMessage>) => {
  const data = e.data
  if (data.type === 'request') {
    chatRequest(data.uid, data.data, data.headers)
  } else if (data.type === 'abort') {
    if (data.uid) {
      const key = `${data.sessionId}:${data.uid}`
      abortHandlerMap.get(key)?.()
      abortHandlerMap.delete(key)
    } else {
      // Abort specific session's all chat requests
      Array.from(abortHandlerMap.keys()).map(key => {
        if (key.startsWith(`${data.sessionId}:`)) {
          abortHandlerMap.get(key)?.()
          abortHandlerMap.delete(key)
        }
      })
    }
  }
})
