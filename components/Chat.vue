<script setup lang="ts">
import { useMutationObserver, useThrottleFn } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'
import { fetchHeadersOllama, fetchHeadersThirdApi, loadOllamaInstructions, loadKnowledgeBases } from '@/utils/settings'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import { type ChatSessionSettings } from '~/pages/chat/index.vue'
import { ChatSettings } from '#components'

export interface Message {
  id?: number
  role: 'system' | 'assistant' | 'user'
  content: string
  type?: 'loading' | 'canceled'
  timestamp: number
}

type Instruction = Awaited<ReturnType<typeof loadOllamaInstructions>>[number]

const props = defineProps<{
  sessionId?: number
}>()

const emits = defineEmits<{
  message: [data: Message]
  changeSettings: [data: ChatSessionSettings]
}>()

const markdown = useMarkdown()
const modal = useModal()
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
let isScrollSmooth = false

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system')
})

watch(() => props.sessionId, async id => {
  if (id) {
    initData(id)
  }
})

useMutationObserver(messageListEl, useThrottleFn(() => {
  messageListEl.value?.scrollTo({
    top: messageListEl.value.scrollHeight,
    behavior: isScrollSmooth ? 'smooth' : 'auto'
  })
  isScrollSmooth = false
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
        type: el.canceled ? 'canceled' : undefined,
      } as const
    })
  }
  return []
}

const fetchStream = async (url: string, options: RequestInit) => {
  const response = await fetch(url, options)

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
        const chatMessage = JSON.parse(line)
        const content = chatMessage?.message?.content
        if (content) {
          const lastItem = messages.value[messages.value.length - 1]
          if (messages.value.length > 0 && lastItem.role === 'assistant') {
            lastItem.content += content
            if (lastItem.id && props.sessionId) {
              await clientDB.chatHistories
                .where('id')
                .equals(lastItem.id)
                .modify({ message: lastItem.content })
            }
          } else {
            const timestamp = Date.now()
            const id = await saveMessage({
              message: content,
              model: model.value || '',
              role: 'assistant',
              timestamp,
              canceled: false
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
  } else {
    console.log("The browser doesn't support streaming responses.")
  }
}

const onSend = async (data: ChatBoxFormData) => {
  const input = data.content.trim()
  if (sending.value || !input || !model.value) {
    return
  }

  isScrollSmooth = true

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

  const controller = new AbortController()
  abortHandler = () => controller.abort()
  await fetchStream('/api/models/chat', {
    method: 'POST',
    body: body,
    headers: {
      ...fetchHeadersOllama.value,
      ...fetchHeadersThirdApi.value,
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  })

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
      await clientDB.chatHistories
        .where('id')
        .equals(lastOne.id!)
        .modify({ canceled: true })
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
        <h2 class="line-clamp-1">{{ sessionInfo?.title || 'Untitled' }}</h2>
        <div class="text-xs text-muted line-clamp-1">{{ instructionInfo?.name }}</div>
      </div>
      <UTooltip v-if="sessionId" text="Modify the current session configuration">
        <UButton icon="i-iconoir-edit-pencil" color="gray" @click="onOpenSettings" />
      </UTooltip>
    </div>
    <div ref="messageListEl" class="relative flex-1 overflow-x-hidden overflow-y-auto px-4">
      <div v-for="( message, index ) in visibleMessages " :key="index"
           class="flex flex-col my-2"
           :class="{ 'items-end': message.role === 'user' }">
        <div class="text-gray-500 dark:text-gray-400 p-1">{{ message.role }}</div>
        <div class="leading-6 text-sm flex items-center max-w-full"
             :class="{ 'text-gray-400 dark:text-gray-500': message.type === 'canceled', 'flex-row-reverse': message.role === 'user' }">
          <div class="border border-primary/20 rounded-lg p-3 max-w-full box-border"
               :class="`${message.role == 'assistant' ? 'bg-gray-50 dark:bg-gray-800' : 'bg-primary-50 dark:bg-primary-400/60'}`">
            <div v-if="message.type === 'loading'"
                 class="text-xl text-primary animate-spin i-heroicons-arrow-path-solid">
            </div>
            <template v-else>
              <pre v-if="message.role === 'user'" v-html="message.content" class="whitespace-break-spaces"></pre>
              <div v-else v-html="markdown.render(message.content)" class="markdown-body" />
            </template>
          </div>
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
          <UTooltip v-if="sessionInfo?.model" text="Current Model" :popper="{ placement: 'top-start' }">
            <div class="flex items-center mr-4">
              <UIcon name="i-heroicons-rectangle-stack" class="mr-1"></UIcon>
              <span class="text-sm">{{ sessionInfo?.modelFamily }}</span>
              <span class="text-muted mx-1">/</span>
              <span class="text-sm">{{ sessionInfo?.model }}</span>
            </div>
          </UTooltip>
          <UTooltip text="Attached Message Count" :popper="{ placement: 'top-start' }">
            <div class="flex items-center">
              <UIcon name="i-material-symbols-history" class="mr-1"></UIcon>
              <span class="text-sm">{{ sessionInfo?.attachedMessagesCount }}</span>
            </div>
          </UTooltip>
        </div>
      </ChatInputBox>
    </div>
  </div>
</template>
