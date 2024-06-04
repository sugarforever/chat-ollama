import type { SetRequired } from 'type-fest'
import type { ChatMessage } from '~/types/chat'
import type { clientDB, ChatHistory } from '~/composables/clientDB'

type RelevantDocument = Required<ChatHistory>['relevantDocs'][number]
type ResponseRelevantDocument = { type: 'relevant_documents', relevant_documents: RelevantDocument[] }
type ResponseMessage = { message: { role: string, content: string } }

interface RequestData {
  sessionId: number
  knowledgebaseId?: number
  /** format: `family::model` */
  model: string
  messages: Array<SetRequired<Partial<ChatMessage>, 'role' | 'content'>>
  stream: boolean
  timestamp: number
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
      model: data.model,
      knowledgeBaseId: data.knowledgebaseId,
      failed: true,
      canceled: false,
      startTime: data.timestamp,
      endTime: Date.now(),
    })
    sendMessageToMain({ uid, type: 'error', sessionId: data.sessionId, id, message: errInfo })
    sendMessageToMain({ id, uid, sessionId: data.sessionId, type: 'complete' })
  } else if (response.body) {
    const reader = response.body.getReader()
    const splitter = ' \n\n'
    let prevPart = ''
    const relevantDocs: RelevantDocument[] = []
    let t = Date.now()

    while (true) {
      const { value, done } = await reader.read().catch((err: any) => {
        if (err.name !== 'AbortError') {
          throw err
        }
        return { done: true, value: undefined }
      })
      if (done) break

      const chunk = prevPart + new TextDecoder().decode(value)

      if (!chunk.includes(splitter)) {
        prevPart = chunk
        continue
      }
      prevPart = ''

      for (const line of chunk.split(splitter)) {
        if (!line) continue

        console.log(`%c${data.model}`, 'color:#818cf8', line)
        const chatMessage = JSON.parse(line) as ResponseMessage | ResponseRelevantDocument
        const isMessage = !('type' in chatMessage) && 'message' in chatMessage

        if (isMessage) {
          msgContent += chatMessage.message.content
        }

        const result: ChatHistory = {
          role: 'assistant' as const,
          model: data.model,
          sessionId: data.sessionId,
          message: msgContent,
          failed: false,
          canceled: false,
          startTime: data.timestamp,
          endTime: Date.now(),
        }

        if (id === -1) {
          id = await addToDB(result)
        }
        // save message to DB after every 1s
        else if (isMessage && Date.now() - t > 1000) {
          t = Date.now()
          updateToDB({ id, message: msgContent })
        }

        if (isMessage) {
          sendMessageToMain({
            uid, type: 'message', sessionId: data.sessionId, id,
            data: {
              id,
              content: msgContent,
              startTime: data.timestamp,
              endTime: Date.now(),
              role: 'assistant',
              model: data.model,
            }
          })
        } else if (chatMessage.type === 'relevant_documents') {
          relevantDocs.push(...chatMessage.relevant_documents)
          sendMessageToMain({
            uid, type: 'relevant_documents', sessionId: data.sessionId, id,
            data: {
              id,
              content: msgContent,
              startTime: data.timestamp,
              endTime: Date.now(),
              role: 'assistant',
              model: data.model,
              relevantDocs: chatMessage.relevant_documents,
            },
          })
        }
      }
    }

    await updateToDB({
      id,
      message: msgContent,
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
  return await db.chatHistories.add(data) as number
}

async function updateToDB(data: SetRequired<Partial<ChatHistory>, 'id'>) {
  await db.chatHistories.where('id')
    .equals(data.id)
    .modify({
      relevantDocs: data.relevantDocs,
      canceled: data.canceled,
      failed: data.failed,
      message: data.message,
      endTime: Date.now(),
    })
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
