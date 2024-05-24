<script setup lang="ts">
import { useMutationObserver, useThrottleFn, useScroll } from '@vueuse/core'
import type { KnowledgeBase } from '@prisma/client'
import { loadOllamaInstructions, loadKnowledgeBases } from '@/utils/settings'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import { type ChatSessionSettings } from '~/pages/chat/index.vue'
import { ChatSettings } from '#components'
import type { ChatMessage } from '~/types/chat'
import type { RequestData } from '~/composables/useStreamChat'

type RelevantDocument = Required<ChatHistory>['relevantDocs'][number]
type Instruction = Awaited<ReturnType<typeof loadOllamaInstructions>>[number]

const props = defineProps<{
  sessionId?: number
}>()

const emits = defineEmits<{
  // remove a message if it's null
  message: [data: ChatMessage | null]
  changeSettings: [data: ChatSessionSettings]
}>()

const { t } = useI18n()
const { request, stopAll } = useStreamChat()
const { chatModels } = useModels()
const modal = useModal()

const sessionInfo = ref<ChatSession>()
const knowledgeBases: KnowledgeBase[] = []
const knowledgeBaseInfo = ref<KnowledgeBase>()
const instructions: Instruction[] = []
const instructionInfo = ref<Instruction>()
const chatInputBoxRef = shallowRef()
/** `['family:model']` */
const models = ref<string[]>([])
const messages = ref<ChatMessage[]>([])
const sending = ref(false)
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
        model: el.model,
        timestamp: el.timestamp,
        type: el.canceled ? 'canceled' : (el.failed ? 'error' : undefined),
        relevantDocs: el.relevantDocs
      } as const
    })
  }
  return []
}

const processRelevantDocuments = async (docs: RelevantDocument[]) => {
  const lastMessage = messages.value[messages.value.length - 1]
  if (lastMessage?.role === 'assistant' && docs) {
    lastMessage.relevantDocs = docs
    await clientDB.chatHistories
      .where('id')
      .equals(lastMessage.id!)
      .modify({
        relevantDocs: docs.map(el => {
          const pageContent = el.pageContent.slice(0, 100) + (el.pageContent.length > 0 ? '...' : '') // Avoid saving large-sized content
          return { ...el, pageContent }
        })
      })
    emits('message', lastMessage)
  }
}

const onSend = async (data: ChatBoxFormData) => {
  const input = data.content.trim()
  if (sending.value || !input || !models.value) {
    return
  }

  const timestamp = Date.now()
  sending.value = true
  chatInputBoxRef.value?.reset()

  const instructionMessage: Array<Pick<ChatMessage, 'role' | 'content'>> = instructionInfo.value
    ? [{ role: "system", content: instructionInfo.value.instruction }]
    : []

  const id = await saveMessage({
    message: input,
    model: models.value.join(','),
    role: 'user',
    timestamp,
    canceled: false,
    failed: false,
    instructionId: instructionInfo.value?.id,
    knowledgeBaseId: knowledgeBaseInfo.value?.id
  })

  const userMessage = { role: "user", id, content: input, timestamp, model: models.value.join(',') || '' } as const
  emits('message', userMessage)
  messages.value.push(userMessage)

  nextTick(() => scrollToBottom('smooth'))
  const attachedMessagesCount = sessionInfo.value?.attachedMessagesCount || 0

  const chatMessages = [
    instructionMessage,
    attachedMessagesCount > 0 ? messages.value.slice(-attachedMessagesCount) : [],
    omit(userMessage, ['id'])
  ].flat()

  models.value.forEach(m => {
    const model = chatModels.value.find(e => e.value === m)
    if (model) {
      messages.value.push({ role: "assistant", content: "", type: 'loading', timestamp, model: model.value })

      chatRequest({
        knowledgebaseId: knowledgeBaseInfo.value?.id,
        model: model.name,
        family: model.family,
        messages: chatMessages,
        stream: true,
      })
    }
  })

  sending.value = false
}

async function chatRequest(data: RequestData) {
  const currentChatModel = `${data.family}:${data.model}`
  let currentMessage = messages.value.find(message => message.model === currentChatModel && message.type === 'loading')!
  let id = 0

  const f = setInterval(() => id > 0 && updateMessageContentToLocalDB(id), 300)

  await request(data, {
    onMessage: async res => {
      const content = res.content
      if (!content) return

      const index = messages.value.indexOf(currentMessage)
      if (messages.value.length > 0 && !currentMessage.type) {
        currentMessage = { ...currentMessage, content: currentMessage.content + content }
        messages.value.splice(index, 1, currentMessage)
      } else {
        id = await saveMessage({
          message: content,
          model: currentChatModel,
          role: 'assistant',
          timestamp: Date.now(),
          canceled: false,
          failed: false,
        })

        currentMessage = { ...currentMessage, id, content, type: undefined }
        messages.value.splice(index, 1, currentMessage)
      }
      emits('message', currentMessage)
    },
    onRelevantDocuments: res => processRelevantDocuments(res),
    onError: async res => {
      const id = await saveMessage({
        message: res.content,
        model: currentChatModel,
        role: res.role,
        timestamp: res.timestamp,
        canceled: false,
        failed: true,
      })
      messages.value = messages.value
        .filter((message) => !(message.model === currentChatModel && message.type === 'loading'))
        .concat({ id, model: currentChatModel, ...res })
      nextTick(() => scrollToBottom('auto'))
    },
    onAbort: () => {
      const index = messages.value.indexOf(currentMessage)
      if (currentMessage.type === 'loading') {
        messages.value.splice(index, 1)
      } else {
        messages.value.splice(index, 1, { ...currentMessage, type: 'canceled' })
      }
    },
  }).catch(noop)
  clearInterval(f)
  await updateMessageContentToLocalDB(id)
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
  stopAll()
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
      }
      Object.assign(sessionInfo.value!, updatedSessionInfo)

      knowledgeBaseInfo.value = data.knowledgeBaseInfo
      instructionInfo.value = data.instructionInfo

      emits('changeSettings', updatedSessionInfo)
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
  instructionInfo.value = instructions.find(el => el.id === result?.instructionId)
  if (result?.models) {
    models.value = result.models
  }
  // incompatible old data
  else if (result?.model) {
    models.value = [`${result.modelFamily}:${result.model}`]
  }

  messages.value = await loadChatHistory(sessionId)
}

async function saveMessage(data: Omit<ChatHistory, 'sessionId'>) {
  return props.sessionId
    ? await clientDB.chatHistories.add({ ...data, sessionId: props.sessionId })
    : Math.random()
}

async function updateMessageContentToLocalDB(id: number) {
  if (!id) return
  const message = messages.value.find(el => el.id === id)
  if (message && message.id) {
    const data = pick(message, ['relevantDocs', 'model'])
    await clientDB.chatHistories.where('id').equals(message.id)
      .modify({
        ...data,
        message: message.content,
        canceled: message.type === 'canceled',
        failed: message.type === 'error',
      })
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
      <ChatMessageItem v-for="message in visibleMessages" :key="message.timestamp"
                       :message :sending :show-toggle-button="models.length > 1"
                       class="my-2" @resend="onResend" @remove="onRemove" />
    </div>
    <div class="shrink-0 pt-4 px-4 border-t border-gray-200 dark:border-gray-800">
      <ChatInputBox ref="chatInputBoxRef"
                    :disabled="models.length === 0" :loading="sending"
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
</template>
