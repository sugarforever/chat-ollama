<script setup lang="ts">
import { useMutationObserver, useThrottleFn, useScroll } from '@vueuse/core'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import type { ChatMessage } from '~/types/chat'
import type { Artifact, ArtifactVersion } from '~/components/ArtifactPanel.vue'
import { getKeysHeader } from '~/utils/settings'
import { useAgentWorker } from '~/composables/useAgentWorker'
import { useArtifacts } from '~/composables/useArtifacts'
import { AgentSettings } from '#components'
import { chatDefaultSettings } from '~/composables/store'



const { t } = useI18n()
const { chatModels } = useModels()
const modal = useModal()
const { onReceivedMessage, sendMessage } = useAgentWorker()

const chatInputBoxRef = shallowRef()
const messages = ref<ChatMessage[]>([])
const sendingCount = ref(0)
const messageListEl = shallowRef<HTMLElement>()
const behavior = ref<ScrollBehavior>('auto')
const { y } = useScroll(messageListEl, { behavior })
const isFirstLoad = ref(true)

// Agent-specific settings
const agentInstruction = ref('You are an expert researcher. Your job is to conduct thorough research, and then write a polished report.\n\nYou have access to a few tools.\n\nUse this to run an internet search for a given query. You can specify the number of results, the topic, and whether raw content should be included.')

// Model selection state
const models = ref<string[]>([])

// Initialize with default model when chatModels are loaded
watch(chatModels, (newModels) => {
  if (newModels.length > 0 && models.value.length === 0) {
    // Use default model from settings if available, otherwise use first available model
    const defaultModels = chatDefaultSettings.value.models
    if (defaultModels && defaultModels.length > 0) {
      // Filter to only include models that are actually available
      const availableDefaultModels = defaultModels.filter(model =>
        newModels.some(m => m.value === model)
      )
      if (availableDefaultModels.length > 0) {
        models.value = availableDefaultModels
        return
      }
    }
    // Fallback to first available model if no default is set or available
    models.value = [newModels[0].value]
  }
}, { immediate: true })

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
  if (messageListEl.value) {
    y.value = messageListEl.value.scrollHeight
  }
}

const visibleMessages = computed(() => {
  return messages.value.filter((message) => message.role !== 'system')
})

useMutationObserver(messageListEl, useThrottleFn((e: MutationRecord[]) => {
  if (e.some(el => (el.target as HTMLElement).dataset.observer === 'ignore')) {
    return
  }
  if (!isUserScrolling.value) {
    scrollToBottom('auto')
  }
}, 250, true), { childList: true, subtree: true })

// Helper function to create a chat message with required fields
function createChatMessage(params: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content' | 'contentType'>): ChatMessage {
  return {
    model: 'agent',
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

const onSend = async (data: ChatBoxFormData) => {
  // Check if we're already sending
  if (sendingCount.value > 0) {
    return
  }

  // Validate content
  const sanitizedContent = data.sanitizedContent ?? data.content
  const hasValidContent = Array.isArray(sanitizedContent)
    ? sanitizedContent.some(item =>
      (item.type === 'text' && item.text?.trim()) ||
      (item.type === 'image_url' && item.image_url?.url)
    )
    : typeof sanitizedContent === 'string'
      ? sanitizedContent.trim()
      : ''

  if (!hasValidContent) {
    return
  }

  const timestamp = Date.now()
  sendingCount.value = 1

  // Generate a unique conversation round UUID
  const conversationRoundId = crypto.randomUUID()

  const userMessage = createChatMessage({
    role: "user",
    id: Math.random(),
    contentType: Array.isArray(data.content) ? 'array' : 'string',
    content: data.content,
    sanitizedContent: data.sanitizedContent,
    startTime: timestamp,
    endTime: timestamp,
    model: 'user',
    toolResult: false,
    toolCallId: '',
    toolCalls: [],
    toolResults: []
  })

  messages.value.push(userMessage)

  // Reset input
  chatInputBoxRef.value?.reset()

  // Create loading message for agent response
  const loadingMessage = createChatMessage({
    id: Math.random(),
    role: 'assistant',
    contentType: 'string',
    content: '',
    type: 'loading',
    startTime: Date.now(),
    endTime: Date.now(),
    model: 'agent',
    toolResult: false,
    toolCallId: '',
    toolCalls: [],
    toolResults: []
  })

  messages.value.push(loadingMessage)

  try {
    // Extract text content from the user message
    const promptText = Array.isArray(sanitizedContent)
      ? sanitizedContent.find(item => item.type === 'text')?.text || ''
      : sanitizedContent as string

    sendMessage({
      type: 'request',
      uid: loadingMessage.id!,
      conversationRoundId: conversationRoundId,
      headers: getKeysHeader(),
      data: {
        instruction: agentInstruction.value,
        prompt: promptText,
        models: models.value
      },
    })
  } catch (error) {
    console.error('Error sending message:', error)
    sendingCount.value = 0
  }
}

onReceivedMessage((data: any) => {
  switch (data.type) {
    case 'error':
      updateMessage(data, { id: data.id, content: data.message, type: 'error' })
      sendingCount.value = 0
      break
    case 'message':
      handleStructuredMessage(data)
      break
    case 'complete':
      sendingCount.value = 0
      break
    case 'abort':
      updateMessage(data, { type: 'canceled' })
      sendingCount.value = 0
      break
  }
})

function handleStructuredMessage(data: any) {
  const messageData = data.data
  const messageType = messageData.messageType

  if (messageType === 'tool') {
    // Handle tool messages - server has already processed them
    const existingIndex = messages.value.findIndex(msg => msg.id === data.id)

    const toolMessage = createChatMessage({
      id: data.id,
      role: 'assistant',
      contentType: 'tool',
      content: messageData.content,
      toolName: messageData.name,
      toolCallId: messageData.tool_call_id,
      startTime: messageData.timestamp,
      endTime: messageData.timestamp,
      model: 'agent',
      type: 'tool'
    })

    if (existingIndex === -1) {
      messages.value.push(toolMessage)
    } else {
      messages.value[existingIndex] = toolMessage
    }

  } else if (messageType === 'ai') {
    // Handle AI messages - server has already processed and accumulated content
    if (messageData.isUpdate) {
      // This is an update to existing AI message - directly modify properties for reactivity
      const aiMessageIndex = messages.value.findIndex(msg => msg.id === data.id)
      if (aiMessageIndex !== -1) {
        const existingMessage = messages.value[aiMessageIndex]
        // Directly modify properties to maintain Vue reactivity
        existingMessage.content = messageData.content
        existingMessage.type = undefined
        existingMessage.messageType = messageData.messageType
        console.log('Updated AI message content:', messageData.content.length, 'characters')
      }
    } else {
      // This is the first AI message - convert loading message or create new
      const loadingMessageIndex = messages.value.findIndex(msg =>
        msg.id === data.uid && msg.type === 'loading'
      )

      if (loadingMessageIndex !== -1) {
        // Convert loading message to AI message - directly modify for reactivity
        const loadingMessage = messages.value[loadingMessageIndex]
        loadingMessage.id = data.id
        loadingMessage.content = messageData.content
        loadingMessage.contentType = 'string'
        loadingMessage.type = undefined
        loadingMessage.messageType = messageData.messageType
        console.log('Created initial AI message content:', messageData.content.length, 'characters')
      } else {
        // Create new AI message
        const aiMessage = createChatMessage({
          id: data.id,
          role: 'assistant',
          contentType: 'string',
          content: messageData.content,
          startTime: messageData.timestamp,
          endTime: messageData.timestamp,
          model: 'agent',
          messageType: messageData.messageType
        })
        messages.value.push(aiMessage)
      }
    }
  }
}

function updateMessage(data: { uid: number, id: number }, newData: Partial<ChatMessage>) {
  const index = messages.value.findIndex(el => el.id === data.uid || el.id === data.id)
  if (index > -1) {
    messages.value.splice(index, 1, { ...messages.value[index], ...newData })
  } else {
    messages.value.push(newData as ChatMessage)
  }
}

async function onAbortChat() {
  sendMessage({ type: 'abort' })
  sendingCount.value = 0
}

async function onResend(data: ChatMessage) {
  onSend({ content: data.content, sanitizedContent: data.sanitizedContent })
}

async function onRemove(data: ChatMessage) {
  messages.value = messages.value.filter(el => el.id !== data.id)
}

// Add artifact support (same as Chat component)
const showArtifacts = ref(false)
const currentArtifact = ref<Artifact | null>(null)
const currentArtifactVersions = ref<ArtifactVersion[]>([])
const { detectArtifact, downloadArtifact, shareArtifact, addArtifactVersion, getArtifactVersions } = useArtifacts()

const isFullscreen = ref(false)

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const closeArtifacts = () => {
  showArtifacts.value = false
  isFullscreen.value = false
}

const onArtifactRequest = (artifact: Artifact) => {
  // Use a static session id for agents
  const sessionId = 'agent-session'

  const existingVersions = getArtifactVersions(sessionId, artifact.type)
  const existingVersion = existingVersions.find((v: ArtifactVersion) =>
    v.artifact.id === artifact.id ||
    (v.messageId === artifact.messageId && v.messageId !== undefined)
  )

  if (existingVersion) {
    currentArtifact.value = existingVersion.artifact
    currentArtifactVersions.value = existingVersions
  } else {
    artifact.messageId = artifact.messageId || Math.random()
    const artifactVersion = addArtifactVersion(sessionId, artifact)

    currentArtifact.value = artifact
    currentArtifactVersions.value = getArtifactVersions(sessionId, artifact.type)
  }

  showArtifacts.value = true
}

const onArtifactEdit = (content: string) => {
  if (currentArtifact.value) {
    currentArtifact.value.content = content
  }
}

const onArtifactDownload = () => {
  if (currentArtifact.value) {
    downloadArtifact(currentArtifact.value)
  }
}

const onArtifactShare = () => {
  if (currentArtifact.value) {
    const result = shareArtifact(currentArtifact.value)
    console.log(result)
  }
}

const onVersionChange = (version: ArtifactVersion) => {
  currentArtifact.value = version.artifact
}

// Reset function for the parent component
function reset() {
  messages.value = []
  sendingCount.value = 0
  isFirstLoad.value = true
  nextTick(() => {
    scrollToBottom('auto')
    isFirstLoad.value = false
  })
}

// Handle model changes
function onModelsChange(selectedModels: string[]) {
  // Additional logic for model change can be added here if needed
  console.log('Selected models for agent:', selectedModels)
}

// Open agent settings
function onOpenSettings() {
  modal.open(AgentSettings, {
    agentInstruction: agentInstruction.value,
    onClose: () => modal.reset(),
    onUpdated: (instruction: string) => {
      agentInstruction.value = instruction
    }
  })
}

// Expose reset function
defineExpose({
  reset
})

onMounted(() => {
  nextTick(() => {
    scrollToBottom('auto')
    isFirstLoad.value = false
  })
})
</script>

<template>
  <div class="flex h-full dark:text-gray-300">
    <!-- Main chat area -->
    <div class="flex flex-col flex-1 min-w-0 h-full">
      <!-- Header -->
      <div class="px-4 border-b border-gray-200 dark:border-gray-700 box-border h-14 flex items-center flex-shrink-0">
        <slot name="left-menu-btn"></slot>
        <div class="mx-auto px-4 text-center">
          <h2 class="line-clamp-1">{{ t('agents.title') || 'AI Agent Chat' }}</h2>
          <div class="text-xs text-muted line-clamp-1">Powered by Deep Agents</div>
        </div>
        <div class="flex items-center space-x-2">
          <!-- Agent settings button -->
          <UTooltip :text="t('agents.settings') || 'Agent Settings'">
            <UButton icon="i-heroicons-cog-6-tooth"
                     color="gray"
                     variant="ghost"
                     @click="onOpenSettings" />
          </UTooltip>
        </div>
      </div>

      <!-- Messages area - scrollable -->
      <div ref="messageListEl" class="flex-1 overflow-x-hidden overflow-y-auto px-4 min-h-0">
        <!-- Welcome message when no messages -->
        <div v-if="messages.length === 0" class="flex flex-col justify-center items-center h-full p-8">
          <div class="text-center space-y-4 max-w-md">
            <div class="w-16 h-16 mx-auto bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 rounded-full flex items-center justify-center">
              <Icon name="i-iconoir-brain" class="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{{ t("agents.welcome") || "Welcome to AI Agents" }}</h2>
            <p class="text-gray-600 dark:text-gray-400">{{ t("agents.welcomeMessage") || "Start chatting with your AI agent. It has access to various tools to help you accomplish tasks." }}</p>

            <!-- Current instruction preview -->
            <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current Agent Instruction:
                </label>
                <UButton icon="i-heroicons-cog-6-tooth"
                         variant="ghost"
                         size="xs"
                         @click="onOpenSettings">
                  Edit
                </UButton>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 p-3 rounded border max-h-20 overflow-y-auto">
                {{ agentInstruction || 'No instruction set' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Chat messages -->
        <template v-for="message in visibleMessages" :key="message.id">
          <!-- Tool messages -->
          <AgentToolMessage
                            v-if="message.type === 'tool'"
                            :name="message.toolName"
                            :content="message.content"
                            :tool-call-id="message.toolCallId"
                            class="my-2" />

          <!-- Regular chat messages -->
          <ChatMessageItem
                           v-else
                           :message="message"
                           :sending="sendingCount > 0"
                           :show-toggle-button="false"
                           class="my-2"
                           @resend="onResend"
                           @remove="onRemove"
                           @artifact="onArtifactRequest" />
        </template>
      </div>

      <!-- Input box - fixed at bottom -->
      <div class="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <ChatInputBox ref="chatInputBoxRef"
                      :disabled="models.length === 0"
                      :loading="sendingCount > 0"
                      :placeholder="t('agents.inputPlaceholder') || 'Ask the agent to help you with anything...'"
                      @submit="onSend"
                      @stop="onAbortChat">
          <div class="text-muted flex">
            <div class="mr-4">
              <ModelSelectorDropdown v-model="models" size="xs" @change="onModelsChange" />
            </div>
            <div class="flex items-center">
              <UIcon name="i-iconoir-brain" class="mr-1"></UIcon>
              <span class="text-sm">AI Agent with Tools</span>
            </div>
          </div>
        </ChatInputBox>
      </div>
    </div>

    <!-- Artifact panel -->
    <ArtifactPanel
                   :artifact="currentArtifact"
                   :versions="currentArtifactVersions"
                   :show="showArtifacts"
                   :is-fullscreen="isFullscreen"
                   @close="closeArtifacts"
                   @edit="onArtifactEdit"
                   @download="onArtifactDownload"
                   @share="onArtifactShare"
                   @version-change="onVersionChange"
                   @toggle-fullscreen="toggleFullscreen" />
  </div>
</template>
