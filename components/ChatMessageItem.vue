<script lang="ts" setup>
import type { ChatMessage } from '~/types/chat'
import { useKatexClient } from '~/composables/useKatexClient'

const props = defineProps<{
  message: ChatMessage
  sending: boolean
  showToggleButton?: boolean
}>()

import type { Artifact } from '~/components/ArtifactPanel.vue'

const emits = defineEmits<{
  resend: [message: ChatMessage]
  remove: [message: ChatMessage]
  artifact: [artifact: Artifact]
}>()

const markdown = useMarkdown()
const { renderMermaidDiagrams } = useMermaidRenderer()
// Initialize client-side KaTeX rendering
useKatexClient()

// Ref for the message content container
const messageContentRef = ref<HTMLElement>()

const opened = ref(props.showToggleButton === true ? false : true)
const isModelMessage = computed(() => props.message.role === 'assistant')
const contentClass = computed(() => {
  return [
    "min-w-[50%]",
    isModelMessage.value ? 'max-w-[calc(100%-2rem)]' : 'max-w-full',
    props.message.type === 'error'
      ? 'bg-red-50 dark:bg-red-800/60'
      : (isModelMessage.value ? 'bg-gray-50 dark:bg-gray-800' : 'bg-primary-50 dark:bg-primary-400/60'),
  ]
})

const timeUsed = computed(() => {
  const endTime = props.message.type === 'loading' ? Date.now() : props.message.endTime
  return Number(((endTime - props.message.startTime) / 1000).toFixed(1))
})

const modelName = computed(() => {
  return parseModelValue(props.message.model)
})

watch(() => props.showToggleButton, (value) => {
  opened.value = value === true ? false : true
})

// Removed preview component refs - now using artifacts

const messageContent = computed(() => {
  const content = props.message.content
  if (!content) return ''

  if (Array.isArray(content)) {
    // Extract text content for markdown rendering
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .filter(Boolean)
      .join('\n')
  }
  return content
})

const messageImages = computed(() => {
  const content = props.message.content
  if (!content || !Array.isArray(content)) return []

  return content
    .filter(item => item.type === 'image_url' && item.image_url?.url)
    .map(item => item.image_url!.url)
})

const { detectArtifact } = useArtifacts()

// Detect artifacts in the current message
const detectedArtifact = computed(() => {
  if (!messageContent.value) return null

  const result = detectArtifact(messageContent.value)
  return result.hasArtifact ? result.artifact : null
})

const toggleArtifact = () => {
  if (detectedArtifact.value) {
    emits('artifact', detectedArtifact.value)
  }
}





const contentDisplay = computed(() => {
  return props.message.type === 'loading' ? 'loading' : 'normal'
})

// Debounced rendering to prevent too frequent attempts during streaming
let renderTimeout: NodeJS.Timeout | null = null

// Watch for changes in message content and render mermaid diagrams
watch([() => props.message.content, () => props.message.type, () => props.message.endTime, opened], async () => {
  // Clear any pending render timeout
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }

  // Only render when message is complete (not loading and has endTime) and we have a container
  const isMessageComplete = props.message.type !== 'loading' && props.message.endTime > 0

  if (isMessageComplete && messageContentRef.value) {
    // Debounce the rendering to avoid rendering incomplete diagrams
    renderTimeout = setTimeout(async () => {
      await nextTick()
      await renderMermaidDiagrams(messageContentRef.value)
      renderTimeout = null
    }, 200) // Reduced timeout since we're now checking for completion
  }
}, { flush: 'post' })

// Also render on mount for existing content
onMounted(async () => {
  const isMessageComplete = props.message.type !== 'loading' && props.message.endTime > 0
  if (isMessageComplete && messageContentRef.value) {
    await nextTick()
    await renderMermaidDiagrams(messageContentRef.value)
  }
})

// Cleanup timeout on unmount
onUnmounted(() => {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
    renderTimeout = null
  }
})
</script>

<template>
  <div class="flex flex-col my-2"
       :class="{ 'items-end': message.role === 'user' }">
    <div class="text-gray-500 dark:text-gray-400 p-1">
      <Icon v-if="message.role === 'user'" name="i-material-symbols-account-circle" class="text-lg" />
      <div v-else class="text-sm flex items-center">
        <UTooltip :text="modelName.family" :popper="{ placement: 'top' }">
          <span class="text-primary/80">{{ modelName.name }}</span>
        </UTooltip>
        <template v-if="timeUsed > 0">
          <span class="mx-2 text-muted/20 text-xs">|</span>
          <span class="text-gray-400 dark:text-gray-500 text-xs">{{ timeUsed }}s</span>
        </template>
      </div>
    </div>
    <div class="leading-6 text-sm flex items-center max-w-full message-content"
         :class="{ 'text-gray-400 dark:text-gray-500': message.type === 'canceled', 'flex-row-reverse': !isModelMessage }">
      <div class="flex border border-primary/20 rounded-lg overflow-hidden box-border"
           :class="contentClass">
        <div v-if="contentDisplay === 'loading'" class="text-xl text-primary p-3">
          <span class="block i-svg-spinners-3-dots-scale"></span>
        </div>
        <template v-else-if="isModelMessage">
          <div class="p-3 overflow-hidden w-full">
            <!-- Tool Calls Display - moved to top -->
            <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls mb-3 space-y-3">
              <div v-for="toolCall in message.toolCalls" :key="toolCall.id" class="tool-call">
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <!-- Tool Header -->
                  <div class="flex items-center gap-2 mb-3">
                    <UIcon name="i-heroicons-cog-6-tooth" class="text-blue-600 dark:text-blue-400" />
                    <span class="font-semibold text-blue-700 dark:text-blue-300">{{ toolCall.name }}</span>
                  </div>

                  <!-- Tool Parameters -->
                  <details class="mb-3">
                    <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                      View parameters
                    </summary>
                    <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">{{ JSON.stringify(toolCall.args, null, 2) }}</pre>
                  </details>

                  <!-- Tool Result -->
                  <div v-if="message.toolResults && message.toolResults.find(r => r.tool_call_id === toolCall.id)"
                       class="tool-result border-t border-blue-200 dark:border-blue-700 pt-3">
                    <details>
                      <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-2">
                        <UIcon name="i-heroicons-check-circle" class="text-blue-600 dark:text-blue-400" />
                        <span class="font-medium text-blue-700 dark:text-blue-300">View result</span>
                      </summary>
                      <div class="mt-2 text-sm bg-gray-50 dark:bg-gray-800/50 rounded p-2">
                        <pre class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{message.toolResults.find(r => r.tool_call_id === toolCall.id)?.content}}</pre>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>

            <!-- Text Content -->
            <div ref="messageContentRef" v-html="markdown.render(messageContent || '')" class="md-body" :class="{ 'line-clamp-3 max-h-[5rem]': !opened }" />

            <!-- Image Gallery -->
            <div v-if="messageImages.length > 0" class="image-gallery mb-3 grid gap-2">
              <img v-for="(url, index) in messageImages"
                   :key="index"
                   :src="url"
                   class="rounded-lg max-h-64 object-contain"
                   :alt="`Image ${index + 1}`" />
            </div>

            <Sources v-show="opened" :relevant_documents="message?.relevantDocs || []" />
          </div>
          <div class="flex flex-col">
            <MessageToggleCollapseButton v-if="showToggleButton" :opened="opened" @click="opened = !opened" />
            <UTooltip v-if="detectedArtifact"
                      text="Preview"
                      :popper="{ placement: 'left' }"
                      class="artifact-tooltip">
              <UButton icon="i-heroicons-eye-20-solid"
                       color="primary"
                       variant="ghost"
                       size="xs"
                       class="mt-1 artifact-btn group hover:scale-105 transition-all duration-200"
                       @click="toggleArtifact" />
            </UTooltip>
          </div>
        </template>
        <template v-else>
          <!-- User message with images -->
          <div class="p-3">
            <div v-if="messageImages.length > 0" class="image-gallery mb-3 grid gap-2">
              <img v-for="(url, index) in messageImages"
                   :key="index"
                   :src="url"
                   class="rounded-lg max-h-64 object-contain"
                   :alt="`Image ${index + 1}`" />
            </div>
            <pre v-if="messageContent" v-text="messageContent" class="whitespace-break-spaces" />
          </div>
        </template>
      </div>
      <ChatMessageActionMore :message="message"
                             :disabled="sending"
                             @resend="emits('resend', message)"
                             @remove="emits('remove', message)">
        <UButton :class="{ invisible: sending }" icon="i-material-symbols-more-vert" color="gray"
                 :variant="'link'"
                 class="action-more">
        </UButton>
      </ChatMessageActionMore>
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

  .artifact-btn {
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      transform: scale(1.05);
    }
  }

  &:hover {
    .artifact-btn {
      opacity: 1;
    }
  }
}

.preview-container {
  border: 1px solid var(--color-gray-200);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--color-gray-50);
  min-height: 100px;

  :deep() {
    * {
      margin: initial;
      padding: initial;
    }
  }
}

.dark {
  .preview-container {
    border-color: var(--color-gray-700);
    background: var(--color-gray-800);
  }
}

.image-gallery {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

  img {
    width: 100%;
    height: auto;
    background: var(--color-gray-100);

    &:hover {
      cursor: pointer;
      opacity: 0.9;
    }
  }
}

.dark {
  .image-gallery img {
    background: var(--color-gray-800);
  }

  .artifact-btn:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
  }
}

/* Custom artifact tooltip styling */
:deep(.artifact-tooltip) {
  .ui-tooltip {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    font-weight: 500;
    font-size: 0.8rem;
    padding: 8px 12px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);

    &::before {
      border-left-color: #667eea;
    }
  }
}
</style>
