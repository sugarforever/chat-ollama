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
  <div class="flex h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/20">
    <!-- Main chat area -->
    <div class="flex flex-col flex-1 min-w-0 h-full">
      <!-- Header - Glassmorphism style -->
      <div class="relative z-10 px-6 box-border h-16 flex items-center flex-shrink-0 backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
        <slot name="left-menu-btn"></slot>
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Icon name="i-heroicons-cpu-chip" class="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('agents.title') || 'AI Agent' }}</h2>
            <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Powered by Deep Agents
            </div>
          </div>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <!-- Agent status indicator -->
          <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
            <Icon name="i-heroicons-wrench-screwdriver" class="w-3.5 h-3.5" />
            <span>Tools Ready</span>
          </div>
          <!-- Agent settings button -->
          <UTooltip :text="t('agents.settings') || 'Agent Settings'">
            <UButton icon="i-heroicons-cog-6-tooth"
                     color="gray"
                     variant="ghost"
                     size="sm"
                     class="hover:bg-gray-100 dark:hover:bg-gray-800"
                     @click="onOpenSettings" />
          </UTooltip>
        </div>
      </div>

      <!-- Messages area - scrollable -->
      <div ref="messageListEl" class="flex-1 overflow-x-hidden overflow-y-auto px-4 md:px-6 min-h-0">
        <!-- Welcome state when no messages -->
        <div v-if="messages.length === 0" class="flex flex-col justify-center items-center min-h-full py-12">
          <div class="w-full max-w-2xl mx-auto space-y-8">
            <!-- Hero section -->
            <div class="text-center space-y-4">
              <div class="relative inline-block">
                <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/30">
                  <Icon name="i-heroicons-sparkles" class="w-10 h-10 text-white" />
                </div>
                <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-4 border-white dark:border-gray-900 flex items-center justify-center">
                  <Icon name="i-heroicons-check" class="w-3 h-3 text-white" />
                </div>
              </div>
              <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                {{ t("agents.welcome") || "Welcome to AI Agent" }}
              </h1>
              <p class="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                {{ t("agents.welcomeMessage") || "Your intelligent assistant with tool access. Ask me to research, analyze, or help with complex tasks." }}
              </p>
            </div>

            <!-- Capabilities grid -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="group p-4 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-blue-500/5">
                <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Web Search</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Search and research topics online</p>
              </div>
              <div class="group p-4 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-purple-500/5">
                <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="i-heroicons-document-text" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">File Access</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Read and write files locally</p>
              </div>
              <div class="group p-4 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="i-heroicons-clipboard-document-list" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Task Planning</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Break down complex tasks</p>
              </div>
            </div>

            <!-- Current instruction card -->
            <div class="relative p-5 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none">
              <div class="absolute top-0 left-6 -translate-y-1/2">
                <span class="px-3 py-1 text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full">
                  Agent Instruction
                </span>
              </div>
              <div class="flex items-start justify-between gap-4 mt-2">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                    {{ agentInstruction || 'No instruction configured. Click Edit to set up your agent.' }}
                  </p>
                </div>
                <UButton icon="i-heroicons-pencil-square"
                         color="primary"
                         variant="soft"
                         size="sm"
                         @click="onOpenSettings">
                  Edit
                </UButton>
              </div>
            </div>

            <!-- Quick prompts -->
            <div class="space-y-3">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 text-center">Try asking</p>
              <div class="flex flex-wrap justify-center gap-2">
                <button class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                        @click="chatInputBoxRef?.setContent('Research the latest trends in AI agents')">
                  Research AI trends
                </button>
                <button class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                        @click="chatInputBoxRef?.setContent('Help me plan a project')">
                  Plan a project
                </button>
                <button class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                        @click="chatInputBoxRef?.setContent('Write a summary report about')">
                  Write a report
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat messages -->
        <div v-else class="py-4 space-y-4">
          <template v-for="message in visibleMessages" :key="message.id">
            <!-- Tool messages -->
            <AgentToolMessage
                              v-if="message.type === 'tool'"
                              :name="message.toolName"
                              :content="message.content"
                              :tool-call-id="message.toolCallId" />

            <!-- Regular chat messages -->
            <ChatMessageItem
                             v-else
                             :message="message"
                             :sending="sendingCount > 0"
                             :show-toggle-button="false"
                             @resend="onResend"
                             @remove="onRemove"
                             @artifact="onArtifactRequest" />
          </template>
        </div>
      </div>

      <!-- Input box - floating style -->
      <div class="flex-shrink-0 p-4 md:p-6">
        <div class="max-w-4xl mx-auto">
          <div class="relative rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-black/20">
            <ChatInputBox ref="chatInputBoxRef"
                          :disabled="models.length === 0"
                          :loading="sendingCount > 0"
                          :placeholder="t('agents.inputPlaceholder') || 'Ask the agent to help you with anything...'"
                          class="border-0 bg-transparent shadow-none"
                          @submit="onSend"
                          @stop="onAbortChat">
              <div class="flex items-center gap-3 text-sm">
                <ModelSelectorDropdown v-model="models" size="xs" @change="onModelsChange" />
                <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <Icon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5" />
                  <span class="text-xs font-medium">Agent Mode</span>
                </div>
              </div>
            </ChatInputBox>
          </div>
        </div>
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
