<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'
import { fetchHeadersOllama, fetchHeadersThirdApi, loadOllamaInstructions } from '@/utils/settings'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import { type ChatSessionSettings } from '~/pages/chat/index.vue'

export interface Message {
  id?: number
  role: 'system' | 'assistant' | 'user'
  content: string
  type?: 'loading' | 'canceled'
  timestamp: number
}

type Instruction = Awaited<ReturnType<typeof loadOllamaInstructions>>[number]

const props = defineProps<{
  knowledgebase?: Record<string, any>
  sessionId?: number
}>()

const emits = defineEmits<{
  message: [data: Message]
  changeSettings: [data: ChatSessionSettings]
}>()

const markdown = useMarkdown()
const sessionInfo = ref<ChatSession>()
const instructions = ref<{ raw: Instruction, label: string, click: () => void }[]>([])
const selectedInstruction = ref<Instruction>()
const chatInputBoxRef = shallowRef()
const model = ref('')
const familyModel = ref('')
const messages = ref<Message[]>([])
const sending = ref(false)
let abortHandler: (() => void) | null = null
const limitHistorySize = 20
const messageListEl = shallowRef<HTMLElement>()
let isFirstScroll = true

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system')
})

watch(() => props.sessionId, async id => {
  if (id) {
    isFirstScroll = true
    initData(id)
  }
})

useMutationObserver(messageListEl, () => {
  messageListEl.value?.scrollTo({
    top: messageListEl.value.scrollHeight,
    behavior: isFirstScroll ? 'auto' : 'smooth'
  })
  isFirstScroll = false
}, { childList: true, subtree: true })

async function loadChatHistory(sessionId?: number) {
  if (typeof sessionId === 'number' && sessionId > 0) {
    const res = await clientDB.chatHistories.where('sessionId').equals(sessionId).offset(0).limit(limitHistorySize).toArray()
    return res.map(el => {
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

  const timestamp = Date.now()
  sending.value = true
  chatInputBoxRef.value?.reset()
  if (selectedInstruction.value) {
    if (messages.value.length > 0 && messages.value[0].role === 'system') {
      messages.value[0].content = selectedInstruction.value.instruction
    } else {
      messages.value = [
        { role: "system", content: selectedInstruction.value.instruction, timestamp },
        ...messages.value
      ]
    }
  }

  const id = await saveMessage({
    message: input,
    model: model.value || '',
    role: 'user',
    timestamp,
    canceled: false,
    instructionId: selectedInstruction.value?.id,
    knowledgeBaseId: props.knowledgebase?.id,
  })

  const userMessage = { role: "user", id, content: input, timestamp } as const
  emits('message', userMessage)
  messages.value.push(
    userMessage,
    { role: "assistant", content: "", type: 'loading', timestamp }
  )

  const body = JSON.stringify({
    knowledgebaseId: props.knowledgebase?.id,
    model: model.value,
    family: familyModel.value,
    messages: [...messages.value.filter(m => m.type !== 'loading')],
    stream: true,
  })

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
  const instructionRes = await loadOllamaInstructions()
  instructions.value = instructionRes.map(el => {
    return {
      raw: el,
      label: el.name,
      click: () => {
        selectedInstruction.value = el
        onChangeSettings({ instructionId: el.id })
      }
    }
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
        .where('timestamp')
        .equals(lastOne.timestamp)
        .modify({ canceled: true })
    }
  }
  sending.value = false
}

function onChangeSettings(data: Partial<ChatSessionSettings>) {
  emits('changeSettings', data)
}

async function initData(sessionId?: number) {
  if (typeof sessionId !== 'number') return

  const result = await clientDB.chatSessions.get(sessionId)
  sessionInfo.value = result
  selectedInstruction.value = instructions.value.find(el => el.raw.id === result?.instructionId)?.raw
  model.value = result?.model || ''
  messages.value = await loadChatHistory(sessionId)
}

async function saveMessage(data: Omit<ChatHistory, 'sessionId'>) {
  return props.sessionId
    ? await clientDB.chatHistories.add({ ...data, sessionId: props.sessionId })
    : Math.random()
}
</script>

<template>
  <div class="flex flex-col flex-1 box-border dark:text-gray-300 -mx-4">
    <div class="flex items-center justify-between px-4 pb-2 shrink-0 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center">
        <span class="mr-2">Chat with</span>
        <ModelsDropdown v-model="model"
                        v-model:family="familyModel"
                        placeholder="Select a model"
                        @change="onChangeSettings({ model })" />
      </div>
      <div>
        <ClientOnly>
          <UDropdown :items="[instructions]" :popper="{ placement: 'bottom-start' }">
            <UButton color="white" :label="`${selectedInstruction ? selectedInstruction.name : 'Select Instruction'}`"
                     trailing-icon="i-heroicons-chevron-down-20-solid" />
          </UDropdown>
        </ClientOnly>
      </div>
    </div>
    <div ref="messageListEl" class="relative flex-1 overflow-auto px-4">
      <div v-for="(message, index) in visibleMessages" :key="index" :class="{ 'text-right': message.role === 'user' }">
        <div class="text-gray-500 dark:text-gray-400">{{ message.role }}</div>
        <div class="mb-4 leading-6" :class="{ 'text-gray-400 dark:text-gray-500': message.type === 'canceled' }">
          <div
               :class="`inline-flex ${message.role == 'assistant' ? 'bg-gray-50 dark:bg-gray-800' : 'bg-primary-50 dark:bg-primary-400/60'} border border-primary/20 rounded-lg px-3 py-2`">
            <div v-if="message.type === 'loading'"
                 class="text-xl text-primary animate-spin i-heroicons-arrow-path-solid">
            </div>
            <div v-else v-html="markdown.render(message.content)" />
          </div>
        </div>
      </div>
    </div>
    <div class="shrink-0 pt-4 px-4 border-t border-gray-200 dark:border-gray-800">
      <ChatInputBox ref="chatInputBoxRef" :disabled="!model" :loading="sending" @submit="onSend" @stop="onAbortChat" />
    </div>
  </div>
</template>

<style>
code {
  color: rgb(31, 64, 226);
  white-space: pre-wrap;
  margin: 0 0.4em;
}

.dark code {
  color: rgb(125, 179, 250);
}
</style>
