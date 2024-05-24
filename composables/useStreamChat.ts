import { getKeysHeader } from '@/utils/settings'
import type { SetRequired } from 'type-fest'
import type { ChatMessage } from '~/types/chat'

type RelevantDocument = Required<ChatHistory>['relevantDocs'][number]
type ResponseRelevantDocument = { type: 'relevant_documents', relevant_documents: RelevantDocument[] }
type ResponseMessage = { message: { role: string, content: string } }
type ErrorMessage = { role: 'assistant', type: 'error', content: string, timestamp: number }

interface RequestOptions {
  onMessage?: (message: ResponseMessage['message']) => Promise<void>
  onRelevantDocuments?: (relevantDocuments: RelevantDocument[]) => Promise<void>
  onError?: (data: ErrorMessage, errMsg: string) => Promise<void>
  onAbort?: () => void
}

export interface RequestData {
  knowledgebaseId?: number
  /** family:model */
  model: string
  family?: string
  messages: Array<SetRequired<Partial<ChatMessage>, 'role' | 'content'>>
  stream: boolean
}

export function useStreamChat() {
  const toast = useToast()
  const { t } = useI18n()
  const abortHandlerSet = new Set<() => void>()

  async function request(data: RequestData, options?: RequestOptions) {
    const controller = new AbortController()
    abortHandlerSet.add(() => {
      controller.abort()
      options?.onAbort?.()
    })

    const response = await fetchWithAuth('/api/models/chat', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        ...getKeysHeader(),
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })

    if (response.status !== 200) {
      const { message: responseMessage } = await response.json()
      const errInfo = responseMessage || `Status Code ${response.status}${' - ' + response.statusText}`
      toast.add({ title: t('global.error'), description: `${errInfo}\n${t("chat.proxyTips")}`, color: 'red' })
      const errorData = { role: 'assistant', type: 'error', content: t('chat.responseException'), timestamp: Date.now() } as const
      await options?.onError?.(errorData, errInfo)
    } else if (response.body) {
      const reader = response.body.getReader()
      const splitter = ' \n\n'
      let prevPart = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = prevPart + new TextDecoder().decode(value)

        if (!chunk.includes(splitter)) {
          prevPart = chunk
          continue
        }
        prevPart = ''

        for (const line of chunk.split(splitter)) {
          if (!line) continue

          console.log(`%c${data.family}:${data.model}`, 'color:#818cf8', line)
          const chatMessage = JSON.parse(line) as ResponseMessage | ResponseRelevantDocument

          if ('type' in chatMessage && chatMessage.type === 'relevant_documents') {
            await options?.onRelevantDocuments?.(chatMessage.relevant_documents)
          } else if ('message' in chatMessage) {
            await options?.onMessage?.(chatMessage.message)
          }
        }
      }
    } else {
      toast.add({ title: t('global.error'), description: t('global.streamError'), color: 'red' })
      throw new Error(t('global.streamError'))
    }
  }

  function stopAll() {
    abortHandlerSet.forEach((handler) => handler())
    abortHandlerSet.clear()
  }

  return { request, stopAll }
}
