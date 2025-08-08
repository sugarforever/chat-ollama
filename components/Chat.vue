<script setup lang="ts">
import { useMutationObserver, useThrottleFn, useScroll } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'
import { loadOllamaInstructions, loadKnowledgeBases } from '@/utils/settings'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import { type ChatSessionSettings } from '~/pages/chat/index.vue'
import { ChatSettings } from '#components'
import type { ChatMessage } from '~/types/chat'

type Instruction = Awaited<ReturnType<typeof loadOllamaInstructions>>[number]

const props = defineProps<{
  sessionId?: number
}>()

const config = useRuntimeConfig()
const isKnowledgeBaseEnabled = computed(() => config.knowledgeBaseEnabled)
const isInstructionsEnabled = computed(() => config.instructionsEnabled)

const emits = defineEmits<{
  // it means remove a message if `data` is null
  message: [data: ChatMessage | null]
  changeSettings: [data: ChatSessionSettings]
  'toggle-sidebar': []
}>()

const { t } = useI18n()
const { chatModels } = useModels()
const modal = useModal()
const { onReceivedMessage, sendMessage } = useChatWorker()

const sessionInfo = ref<ChatSession>()
const knowledgeBases: KnowledgeBase[] = []
const knowledgeBaseInfo = ref<KnowledgeBase>()
const instructions: Instruction[] = []
const instructionInfo = ref<Instruction>()
const chatInputBoxRef = shallowRef()
/** `['family:model']` */
const models = ref<string[]>([])
const messages = ref<ChatMessage[]>([])
const sendingCount = ref(0)
const messageListEl = shallowRef<HTMLElement>()
const behavior = ref<ScrollBehavior>('auto')
const { y } = useScroll(messageListEl, { behavior })
const isFirstLoad = ref(true)
const limitHistorySize = computed(() => Math.max(sessionInfo.value?.attachedMessagesCount || 0, 20))

const isUserScrolling = computed(() => {
  if (isFirstLoad.value) return false

  if (messageListEl.value) {
    const bottomOffset = messageListEl.value.scrollHeight - messageListEl.value.clientHeight
    if (bottomOffset - y.value < 120) {
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
    sendingCount.value = 0
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
}, 250, true), { childList: true, subtree: true })

async function loadChatHistory(sessionId?: number) {
  if (typeof sessionId === 'number' && sessionId > 0) {
    const res = await clientDB.chatHistories.where('sessionId').equals(sessionId).sortBy('id')
    return res.slice(-limitHistorySize.value).map(el => {
      return {
        id: el.id,
        content: el.message,
        contentType: el.messageType || 'string',
        role: el.role,
        model: el.model,
        startTime: el.startTime || 0,
        endTime: el.endTime || 0,
        type: el.canceled ? 'canceled' : (el.failed ? 'error' : undefined),
        relevantDocs: el.relevantDocs,
        toolResult: el.toolResult || false,
        toolCallId: el.toolCallId || '',
        toolCalls: el.toolCalls || [],
        toolResults: el.toolResults || []
      } as const
    })
  }
  return []
}

// Helper function to create a chat message with required fields
function createChatMessage(params: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content' | 'contentType'>): ChatMessage {
  return {
    model: '',
    startTime: Date.now(),
    endTime: Date.now(),
    toolResult: false,
    toolCallId: '',
    toolCalls: [],
    toolResults: [],
    type: undefined,
    ...params
  }
}

async function saveMessage(data: Omit<ChatHistory, 'sessionId'>) {
  return props.sessionId
    ? await clientDB.chatHistories.add({ ...data, sessionId: props.sessionId })
    : Math.random()
}

const onSend = async (data: ChatBoxFormData) => {
  // Check if we're already sending or if models are not available
  if (sendingCount.value > 0 || !models.value) {
    return
  }

  // Validate content based on its type
  const hasValidContent = Array.isArray(data.content)
    ? data.content.some(item =>
      (item.type === 'text' && item.text?.trim()) ||
      (item.type === 'image_url' && item.image_url?.url)
    )
    : data.content.trim()

  if (!hasValidContent) {
    return
  }

  const timestamp = Date.now()
  sendingCount.value++

  const id = await saveMessage({
    message: data.content,
    model: models.value.join(','),
    role: 'user',
    messageType: Array.isArray(data.content) ? 'array' : 'string',
    startTime: timestamp,
    endTime: timestamp,
    toolResult: false,
    toolCallId: '',
    failed: false,
    canceled: false,
  })

  const userMessage = createChatMessage({
    role: "user",
    id,
    contentType: Array.isArray(data.content) ? 'array' : 'string',
    content: data.content,
    startTime: timestamp,
    endTime: timestamp,
    model: models.value.join(',') || '',
    toolResult: false,
    toolCallId: '',
    toolCalls: [],
    toolResults: []
  })

  emits('message', userMessage)
  messages.value.push(userMessage)

  // Create loading message
  const loadingMessage = createChatMessage({
    id: Math.random(),
    role: 'assistant',
    contentType: 'string',
    content: '',
    type: 'loading',
    startTime: Date.now(),
    endTime: Date.now(),
    model: models.value.join(','),
    toolResult: false,
    toolCallId: '',
    toolCalls: [],
    toolResults: []
  })

  emits('message', loadingMessage)
  messages.value.push(loadingMessage)

  // Reset input
  chatInputBoxRef.value?.reset()

  try {
    const chatMessages = messages.value
      .filter(m => {
        if (m.type === 'error' || m.type === 'canceled' || m.type === 'loading')
          return false
        return true
      })
      .map(m => ({
        ...m,
        toolResult: false,
        toolCallId: '',
        toolCalls: m.toolCalls || [],
        toolResults: m.toolResults || []
      }))

    if (isInstructionsEnabled.value && instructionInfo.value) {
      chatMessages.unshift(createChatMessage({
        role: 'system',
        contentType: 'string',
        content: instructionInfo.value.instruction,
        toolResult: false,
        toolCallId: '',
        toolCalls: [],
        toolResults: []
      }))
    }

    // Send message to each model
    for (const m of models.value) {
      const model = chatModels.value.find(e => e.value === m)
      if (model) {
        sendMessage({
          type: 'request',
          uid: loadingMessage.id!,
          headers: getKeysHeader(),
          data: {
            knowledgebaseId: knowledgeBaseInfo.value?.id,
            model: model.value,
            messages: chatMessages,
            stream: true,
            sessionId: sessionInfo.value!.id!,
            timestamp,
          },
        })
      }
    }
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

onReceivedMessage(data => {
  if (data.sessionId !== sessionInfo.value!.id) return

  switch (data.type) {
    case 'error':
      updateMessage(data, { id: data.id, content: data.message, type: 'error' })
      break
    case 'message':
      if (sendingCount.value === 0) sendingCount.value += 1
      updateMessage(data, { type: undefined, ...data.data })
      break
    case 'relevant_documents':
      updateMessage(data, { type: undefined, ...data.data })
      break
    case 'complete':
      sendingCount.value -= 1
      break
    case 'abort':
      updateMessage(data, { type: 'canceled' })
      break
  }
})

onMounted(async () => {
  const promises = []

  if (isInstructionsEnabled.value) {
    promises.push(loadOllamaInstructions())
  }

  if (isKnowledgeBaseEnabled.value) {
    promises.push(loadKnowledgeBases())
  }

  await Promise.all(promises)
    .then((results) => {
      let resultIndex = 0

      if (isInstructionsEnabled.value && results[resultIndex]) {
        instructions.push(...results[resultIndex])
        resultIndex++
      }

      if (isKnowledgeBaseEnabled.value && results[resultIndex]) {
        knowledgeBases.push(...results[resultIndex])
      }
    })
  initData(props.sessionId)
})

function updateMessage(data: WorkerSendMessage, newData: Partial<ChatMessage>) {
  const index = 'id' in data ? messages.value.findIndex(el => el.id === data.uid || el.id === data.id) : -1
  if (index > -1) {
    messages.value.splice(index, 1, { ...messages.value[index], ...newData })
  } else {
    messages.value.push(newData as ChatMessage)
  }
}

async function onAbortChat() {
  sendMessage({ type: 'abort', sessionId: sessionInfo.value!.id! })
  sendingCount.value = 0
}

function onOpenSettings() {
  modal.open(ChatSettings, {
    sessionId: props.sessionId!,
    onClose: () => modal.reset(),
    onUpdated: data => {
      const updatedSessionInfo: Partial<ChatSession> = {
        title: data.title,
        attachedMessagesCount: data.attachedMessagesCount,
        knowledgeBaseId: data.knowledgeBaseInfo?.id,
        instructionId: data.instructionInfo?.id,
      }
      Object.assign(sessionInfo.value!, updatedSessionInfo)

      knowledgeBaseInfo.value = data.knowledgeBaseInfo
      instructionInfo.value = data.instructionInfo

      emits('changeSettings', updatedSessionInfo)
    },
    onClear: () => {
      messages.value = []
    }
  })
}

async function onModelsChange(models: string[]) {
  await clientDB.chatSessions.update(props.sessionId!, { models })
}

async function onResend(data: ChatMessage) {
  onSend({ content: data.content })
}

async function onRemove(data: ChatMessage) {
  await clientDB.chatHistories.where('id').equals(data.id!).delete()
  messages.value = messages.value.filter(el => el.id !== data.id)
  emits('message', null)
}

async function initData(sessionId?: number) {
  if (typeof sessionId !== 'number') return

  const result = await clientDB.chatSessions.get(sessionId)
  sessionInfo.value = result
  knowledgeBaseInfo.value = knowledgeBases.find(el => el.id === result?.knowledgeBaseId)
  instructionInfo.value = isInstructionsEnabled.value
    ? instructions.find(el => el.id === result?.instructionId)
    : undefined
  if (result?.models) {
    models.value = result.models
  }
  // incompatible old data
  else if (result?.model) {
    models.value = [`${result.modelFamily}/${result.model}`]
  }

  messages.value = await loadChatHistory(sessionId)

  nextTick(() => {
    scrollToBottom('auto')
    isFirstLoad.value = false
  })
}

// Add new state for preview
const showPreview = ref(false)
const previewContent = ref('')

// Add method to handle preview requests from messages
const onPreviewRequest = (content: string) => {
  previewContent.value = content
  showPreview.value = true
}

// Add near the top of the script section
const isSessionListVisible = inject('isSessionListVisible', ref(true))
</script>

<template>
  <div class="flex h-full dark:text-gray-300">
    <!-- Main chat area -->
    <div class="flex flex-col flex-1 min-w-0 h-full">
      <!-- Header -->
      <div class="px-4 border-b border-gray-200 dark:border-gray-700 box-border h-[57px] flex items-center flex-shrink-0">
        <slot name="left-menu-btn"></slot>
        <UIcon
               :name="isSessionListVisible ? 'i-heroicons-chevron-double-left' : 'i-heroicons-chevron-double-right'"
               class="mr-2 text-lg text-gray-500 hidden md:block cursor-pointer hover:text-primary-500"
               @click="$emit('toggle-sidebar')" />
        <ChatConfigInfo v-if="isInstructionsEnabled && instructionInfo" icon="i-iconoir-terminal"
                        :title="instructionInfo.name"
                        :description="instructionInfo.instruction"
                        class="hidden md:block" />
        <ChatConfigInfo v-if="knowledgeBaseInfo" icon="i-heroicons-book-open"
                        :title="knowledgeBaseInfo.name"
                        class="mx-2 hidden md:block" />
        <div class="mx-auto px-4 text-center">
          <h2 class="line-clamp-1">{{ sessionInfo?.title || t('chat.untitled') }}</h2>
          <div v-if="isInstructionsEnabled" class="text-xs text-muted line-clamp-1">{{ instructionInfo?.name }}</div>
        </div>
        <UTooltip v-if="sessionId" :text="t('chat.modifyTips')">
          <UButton icon="i-iconoir-edit-pencil" color="gray" @click="onOpenSettings" />
        </UTooltip>
      </div>

      <!-- Messages area - scrollable -->
      <div ref="messageListEl" class="flex-1 overflow-x-hidden overflow-y-auto px-4 min-h-0">
        <ChatMessageItem v-for="message in visibleMessages" :key="message.id"
                         :message="message" :sending="sendingCount > 0" :show-toggle-button="models.length > 1"
                         :is-previewing="showPreview && message.content === previewContent"
                         class="my-2" @resend="onResend" @remove="onRemove" @preview="onPreviewRequest" />
      </div>

      <!-- Input box - fixed at bottom -->
      <div class="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <ChatInputBox ref="chatInputBoxRef"
                      :disabled="models.length === 0" :loading="sendingCount > 0"
                      @submit="onSend" @stop="onAbortChat">
          <div class="text-muted flex">
            <div class="mr-4">
              <ModelsMultiSelectMenu v-model="models" @change="onModelsChange" />
            </div>
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

    <!-- Preview panel -->
    <ComponentPreview
                      :content="previewContent"
                      :show="showPreview"
                      @close="showPreview = false" />
  </div>
</template>
