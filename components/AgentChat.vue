<script setup lang="ts">
import { useMutationObserver, useThrottleFn, useScroll } from '@vueuse/core'
import { type ChatBoxFormData } from '@/components/ChatInputBox.vue'
import type { ChatMessage } from '~/types/chat'
import type { Artifact, ArtifactVersion } from '~/components/ArtifactPanel.vue'
import { getKeysHeader } from '~/utils/settings'
import { useAgentWorker } from '~/composables/useAgentWorker'
import { useArtifacts } from '~/composables/useArtifacts'

const { t } = useI18n()
const { onReceivedMessage, sendMessage } = useAgentWorker()

const chatInputBoxRef = shallowRef()
const messages = ref<ChatMessage[]>([])
const sendingCount = ref(0)
const messageListEl = shallowRef<HTMLElement>()
const behavior = ref<ScrollBehavior>('auto')
const { y } = useScroll(messageListEl, { behavior })
const isFirstLoad = ref(true)

// Agent-specific settings
const agentInstruction = ref('You are a helpful AI assistant. Use the available tools to help the user with their requests.')

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
    sendingCount.value = 1

    const userMessage = createChatMessage({
        role: "user",
        id: Math.random(),
        contentType: Array.isArray(data.content) ? 'array' : 'string',
        content: data.content,
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
        const promptText = Array.isArray(data.content)
            ? data.content.find(item => item.type === 'text')?.text || ''
            : data.content

        sendMessage({
            type: 'request',
            uid: loadingMessage.id!,
            headers: getKeysHeader(),
            data: {
                instruction: agentInstruction.value,
                prompt: promptText
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
            updateMessage(data, { content: data.data.content, type: undefined })
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
    onSend({ content: data.content })
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
                    <!-- Agent instruction input -->
                    <UTooltip text="Edit Agent Instruction">
                        <UButton icon="i-iconoir-edit-pencil"
                                 color="gray"
                                 variant="ghost"
                                 @click="$event.target.nextElementSibling?.focus()" />
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

                        <!-- Agent instruction display/edit -->
                        <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Agent Instruction:
                            </label>
                            <UTextarea v-model="agentInstruction"
                                       :rows="3"
                                       placeholder="Enter agent instructions..."
                                       class="w-full" />
                        </div>
                    </div>
                </div>

                <!-- Chat messages -->
                <ChatMessageItem v-for="message in visibleMessages" :key="message.id"
                                 :message="message"
                                 :sending="sendingCount > 0"
                                 :show-toggle-button="false"
                                 class="my-2"
                                 @resend="onResend"
                                 @remove="onRemove"
                                 @artifact="onArtifactRequest" />
            </div>

            <!-- Input box - fixed at bottom -->
            <div class="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
                <ChatInputBox ref="chatInputBoxRef"
                              :disabled="false"
                              :loading="sendingCount > 0"
                              :placeholder="t('agents.inputPlaceholder') || 'Ask the agent to help you with anything...'"
                              @submit="onSend"
                              @stop="onAbortChat">
                    <div class="text-muted flex items-center">
                        <UIcon name="i-iconoir-brain" class="mr-1"></UIcon>
                        <span class="text-sm">AI Agent with Tools</span>
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
