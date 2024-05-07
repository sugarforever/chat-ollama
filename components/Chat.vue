<script setup lang="ts">
import { useMutationObserver, useThrottleFn, useScroll } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'
import { getKeysHeader, loadOllamaInstructions, loadKnowledgeBases } from '@/utils/settings'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import { type ChatSessionSettings } from '~/pages/chat/index.vue'
import { ChatSettings } from '#components'

type RelevantDocument = Required<ChatHistory>['relevantDocs'][number]
type ResponseRelevantDocument = { type: 'relevant_documents', relevant_documents: RelevantDocument[] }

export interface Message {
  id?: number
  role: 'system' | 'assistant' | 'user'
  content: string
  type?: 'loading' | 'canceled' | 'error'
  timestamp: number
  relevantDocs?: RelevantDocument[]
}

type Instruction = Awaited<ReturnType<typeof loadOllamaInstructions>>[number]

const props = defineProps<{
  sessionId?: number
}>()

const emits = defineEmits<{
  // remove a message if it's null
  message: [data: Message | null]
  changeSettings: [data: ChatSessionSettings]
}>()

const { t } = useI18n()

const markdown = useMarkdown()
const modal = useModal()
const toast = useToast()
const sessionInfo = ref<ChatSession>()
const knowledgeBases: KnowledgeBase[] = []
const knowledgeBaseInfo = ref<KnowledgeBase>()
const instructions: Instruction[] = []
const instructionInfo = ref<Instruction>()
const chatInputBoxRef = shallowRef()
const model = ref('')
const modelFamily = ref('')
const messages = ref<Message[]>([])
const sending = ref(false)
let abortHandler: (() => void) | null = null
const limitHistorySize = 20
const messageListEl = shallowRef<HTMLElement>()
const behavior = ref<ScrollBehavior>('auto')
const { y } = useScroll(messageListEl, { behavior })
const isFirstLoad = ref(true)

const isUserScrolling = computed(() => {
  if (isFirstLoad.value) return false

  if (messageListEl.value) {
    const bottomOffset = messageListEl.value.scrollHeight - messageListEl.value.clientHeight
    if (bottomOffset - y.value < 60) {
      return false
    }
  }
  return true
})

const scrollToBottom = (_behavior: ScrollBehavior) => {
  behavior.value = _behavior
  y.value = messageListEl.value!.scrollHeight
}


const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system')
})

watch(() => props.sessionId, async id => {
  if (id) {
    isFirstLoad.value = true
    initData(id)
  }
})

useMutationObserver(messageListEl, useThrottleFn((e: MutationRecord[]) => {
  if (e.some(el => (el.target as HTMLElement).dataset.observer === 'ignore')) {
    return
  }
  if (!isUserScrolling.value) {
    scrollToBottom('auto')
  }
  if (isFirstLoad.value) {
    isFirstLoad.value = false
  }
}, 200), { childList: true, subtree: true })

async function loadChatHistory(sessionId?: number) {
  if (typeof sessionId === 'number' && sessionId > 0) {
    const res = await clientDB.chatHistories.where('sessionId').equals(sessionId).sortBy('id')
    return res.slice(-limitHistorySize).map(el => {
      return {
        id: el.id,
        content: el.message,
        role: el.role,
        timestamp: el.timestamp,
        type: el.canceled ? 'canceled' : (el.failed ? 'error' : undefined),
        relevantDocs: el.relevantDocs
      } as const
    })
  }
  return []
}

const processRelevantDocuments = async (chunk: ResponseRelevantDocument) => {
  if (chunk.type !== 'relevant_documents') return
  const lastMessage = messages.value[messages.value.length - 1]
  if (lastMessage?.role === 'assistant' && chunk.relevant_documents) {
    lastMessage.relevantDocs = chunk.relevant_documents
    await clientDB.chatHistories
      .where('id')
      .equals(lastMessage.id!)
      .modify({
        relevantDocs: chunk.relevant_documents.map(el => {
          const pageContent = el.pageContent.slice(0, 100) + (el.pageContent.length > 0 ? '...' : '') // Avoid saving large-sized content
          return { ...el, pageContent }
        })
      })
    emits('message', lastMessage)
  }
}

const fetchStream = async (url: string, options: RequestInit) => {
  const response = await fetchWithAuth(url, options)

  if (response.status !== 200) {
    const { message: respnoseMesage } = await response.json()
    const errInfo = respnoseMesage || `Status Code ${response.status}${' - ' + response.statusText}`
    toast.add({ title: t('global.error'), description: `${errInfo}\n${t("chat.proxyTips")}`, color: 'red' })
    const errorData = { role: 'assistant', type: 'error', content: t('chat.responseException'), timestamp: Date.now() } as const
    const id = await saveMessage({
      message: errorData.content,
      model: model.value || '',
      role: errorData.role,
      timestamp: errorData.timestamp,
      canceled: false,
      failed: true,
    })
    messages.value = messages.value.filter((message) => message.type !== 'loading').concat({ id, ...errorData })
    nextTick(() => scrollToBottom('auto'))
    return
  }

  if (response.body) {
    messages.value = messages.value.filter((message) => message.type !== 'loading')
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder().decode(value)
      for (const line of chunk.split('\n\n')) {
        if (!line) continue

        console.log('line: ', line)
        const chatMessage = JSON.parse(line) as { message: Message } | ResponseRelevantDocument

        if ('type' in chatMessage) {
          await processRelevantDocuments(chatMessage)
        } else {
          const content = chatMessage?.message?.content
          if (content) {
            const lastItem = messages.value[messages.value.length - 1]
            if (messages.value.length > 0 && lastItem.role === 'assistant') {
              lastItem.content += content
            } else {
              const timestamp = Date.now()
              const id = await saveMessage({
                message: content,
                model: model.value || '',
                role: 'assistant',
                timestamp,
                canceled: false,
                failed: false,
              })
              const itemData = { id, role: 'assistant', content, timestamp } as const
              if (messages.value.length >= limitHistorySize) {
                messages.value = [...messages.value, itemData].slice(-limitHistorySize)
              } else {
                messages.value.push(itemData)
              }
            }
            emits('message', lastItem)
          }
        }
      }
    }
  } else {
    console.log(t("chat.The browser doesn't support streaming responses"))
  }
}

const onSend = async (data: ChatBoxFormData) => {
  const input = data.content.trim()
  if (sending.value || !input || !model.value) {
    return
  }

  const timestamp = Date.now()
  sending.value = true
  chatInputBoxRef.value?.reset()

  const instructionMessage = instructionInfo.value
    ? { role: "system", content: instructionInfo.value.instruction, timestamp }
    : []

  const id = await saveMessage({
    message: input,
    model: model.value || '',
    role: 'user',
    timestamp,
    canceled: false,
    failed: false,
    instructionId: instructionInfo.value?.id,
    knowledgeBaseId: knowledgeBaseInfo.value?.id
  })

  const userMessage = { role: "user", id, content: input, timestamp } as const
  emits('message', userMessage)

  const body = JSON.stringify({
    knowledgebaseId: knowledgeBaseInfo.value?.id,
    model: model.value,
    family: modelFamily.value,
    messages: [
      instructionMessage,
      messages.value.slice(messages.value.length - sessionInfo.value!.attachedMessagesCount),
      omit(userMessage, ['id'])
    ].flat(),
    stream: true,
  })

  messages.value.push(
    userMessage,
    { role: "assistant", content: "", type: 'loading', timestamp }
  )

  nextTick(() => {
    scrollToBottom('smooth')
  })

  const f = setInterval(() => syncLatestMessageToLocalDB(), 250)

  const controller = new AbortController()
  abortHandler = () => controller.abort()

  await fetchStream('/api/models/chat', {
    method: 'POST',
    body: body,
    headers: {
      ...getKeysHeader(),
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  }).finally(() => clearInterval(f))

  await syncLatestMessageToLocalDB()

  sending.value = false
}

onMounted(async () => {
  await Promise.all([loadOllamaInstructions(), loadKnowledgeBases()])
    .then(([res1, res2]) => {
      instructions.push(...res1)
      knowledgeBases.push(...res2)
    })
  initData(props.sessionId)
})

async function onAbortChat() {
  abortHandler?.()
  if (messages.value.length > 0) {
    const lastOne = messages.value[messages.value.length - 1]
    if (lastOne.type === 'loading') {
      messages.value.pop()
    } else if (lastOne.role === 'assistant') {
      lastOne.type = 'canceled'
      await syncLatestMessageToLocalDB({ canceled: true })
    }
  }
  sending.value = false
}

function onOpenSettings() {
  modal.open(ChatSettings, {
    sessionId: props.sessionId!,
    onClose: () => modal.close(),
    onUpdated: data => {
      const updatedSessionInfo: Partial<ChatSession> = {
        title: data.title,
        attachedMessagesCount: data.attachedMessagesCount,
        knowledgeBaseId: data.knowledgeBaseInfo?.id,
        instructionId: data.instructionInfo?.id,
        model: data.modelInfo.value,
        modelFamily: data.modelInfo.family
      }
      Object.assign(sessionInfo.value!, updatedSessionInfo)

      model.value = data.modelInfo.value
      modelFamily.value = data.modelInfo.family || ''
      knowledgeBaseInfo.value = data.knowledgeBaseInfo
      instructionInfo.value = data.instructionInfo

      emits('changeSettings', updatedSessionInfo)
    }
  })
}

async function onResend(data: Message) {
  onSend({ content: data.content })
}

async function onRemove(data: Message) {
  await clientDB.chatHistories.where('id').equals(data.id!).delete()
  messages.value = messages.value.filter(el => el.id !== data.id)
  emits('message', null)
}

async function initData(sessionId?: number) {
  if (typeof sessionId !== 'number') return

  const result = await clientDB.chatSessions.get(sessionId)
  sessionInfo.value = result
  knowledgeBaseInfo.value = knowledgeBases.find(el => el.id === result?.knowledgeBaseId)
  instructionInfo.value = instructions.find(el => el.id === result?.instructionId)
  model.value = result?.model || ''
  modelFamily.value = result?.modelFamily || ''
  messages.value = await loadChatHistory(sessionId)
}

async function saveMessage(data: Omit<ChatHistory, 'sessionId'>) {
  return props.sessionId
    ? await clientDB.chatHistories.add({ ...data, sessionId: props.sessionId })
    : Math.random()
}

async function syncLatestMessageToLocalDB(data?: Partial<ChatHistory>) {
  const lastItem = messages.value[messages.value.length - 1]
  if (messages.value.length > 0 && lastItem.role === 'assistant') {
    if (lastItem.id && props.sessionId) {
      await clientDB.chatHistories
        .where('id')
        .equals(lastItem.id)
        .modify({ ...data, message: lastItem.content })
    }
  }
}

defineExpose({ abortChat: onAbortChat })
</script>

<template>
  <div class="flex flex-col box-border dark:text-gray-300 -mx-4">
    <div class="px-4 border-b border-gray-200 dark:border-gray-700 box-border h-[57px] flex items-center">
      <ChatConfigInfo v-if="instructionInfo" icon="i-iconoir-terminal"
                      :title="instructionInfo.name"
                      :description="instructionInfo.instruction" />
      <ChatConfigInfo v-if="knowledgeBaseInfo" icon="i-heroicons-book-open"
                      :title="knowledgeBaseInfo.name"
                      class="mx-2" />
      <div class="mx-auto px-4 text-center">
        <h2 class="line-clamp-1">{{ sessionInfo?.title || t('chat.untitled') }}</h2>
        <div class="text-xs text-muted line-clamp-1">{{ instructionInfo?.name }}</div>
      </div>
      <UTooltip v-if="sessionId" :text="t('chat.modifyTips')">
        <UButton icon="i-iconoir-edit-pencil" color="gray" @click="onOpenSettings" />
      </UTooltip>
    </div>
    <div ref="messageListEl" class="relative flex-1 overflow-x-hidden overflow-y-auto px-4">
      <div v-for="( message, index ) in visibleMessages " :key="index"
           class="flex flex-col my-2"
           :class="{ 'items-end': message.role === 'user' }">
        <div class="text-gray-500 dark:text-gray-400 p-1">{{ message.role }}</div>
        <div class="leading-6 text-sm flex items-center max-w-full message-content"
             :class="{ 'text-gray-400 dark:text-gray-500': message.type === 'canceled', 'flex-row-reverse': message.role === 'user' }">
          <div class="border border-primary/20 rounded-lg p-3 box-border"
               :class="[
                `${message.role == 'assistant' ? 'max-w-[calc(100%-2rem)]' : 'max-w-full'}`,
                message.type === 'error' ? 'bg-red-50 dark:bg-red-800/60' : (message.role == 'assistant' ? 'bg-gray-50 dark:bg-gray-800' : 'bg-primary-50 dark:bg-primary-400/60'),
              ]">
            <div v-if="message.type === 'loading'"
                 class="text-xl text-primary animate-spin i-heroicons-arrow-path-solid">
            </div>
            <template v-else>
              <pre v-if="message.role === 'user'" v-html="message.content" class="whitespace-break-spaces" />
              <div v-else>
                <div v-html="markdown.render(message.content)" class="md-body" />
                <Sources :relevant_documents="message?.relevantDocs || []" />
              </div>
            </template>
          </div>
          <ChatMessageActionMore :message="message"
                                 :disabled="sending"
                                 @resend="onResend(message)"
                                 @remove="onRemove(message)">
            <UButton :class="{ invisible: sending }" icon="i-material-symbols-more-vert" color="gray"
                     :variant="'link'"
                     class="action-more">
            </UButton>
          </ChatMessageActionMore>
        </div>
      </div>
    </div>
    <div class="shrink-0 pt-4 px-4 border-t border-gray-200 dark:border-gray-800">
      <ChatInputBox ref="chatInputBoxRef"
                    :disabled="!model"
                    :loading="sending"
                    @submit="onSend"
                    @stop="onAbortChat">
        <div class="text-muted flex">
          <UTooltip v-if="sessionInfo?.model" :text="t('chat.currentModel')" :popper="{ placement: 'top-start' }">
            <div class="flex items-center mr-4 cursor-pointer hover:text-primary-400" @click="onOpenSettings">
              <UIcon name="i-heroicons-rectangle-stack" class="mr-1"></UIcon>
              <span class="text-sm">{{ sessionInfo?.modelFamily }}</span>
              <span class="text-muted mx-1">/</span>
              <span class="text-sm">{{ sessionInfo?.model }}</span>
            </div>
          </UTooltip>
          <UTooltip :text="t('chat.attachedMessagesCount')" :popper="{ placement: 'top-start' }">
            <div class="flex items-center cursor-pointer hover:text-primary-400" @click="onOpenSettings">
              <UIcon name="i-material-symbols-history" class="mr-1"></UIcon>
              <span class="text-sm">{{ sessionInfo?.attachedMessagesCount }}</span>
            </div>
          </UTooltip>
        </div>
      </ChatInputBox>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message-content {
  .action-more {
    transform-origin: center center;
    transition: all 0.3s;
    transform: scale(0);
    opacity: 0;
  }

  &:hover {
    .action-more {
      transform: scale(1);
      opacity: 1;
    }
  }
}
</style>
