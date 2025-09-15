<script lang="ts" setup>
import type { ChatMessage } from '~/types/chat'
import { useKatexClient } from '~/composables/useKatexClient'
import { useClipboard } from '@vueuse/core'

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
  fork: [message: ChatMessage]
  'quick-chat': [{ selectedContent: string, position: { x: number, y: number }, messageId: string }]
}>()

const markdown = useMarkdown()
const { renderMermaidDiagrams } = useMermaidRenderer()
// Initialize client-side KaTeX rendering
useKatexClient()

// Add clipboard functionality
const { copy, isSupported } = useClipboard({ legacy: true })
const toast = useToast()
const { t } = useI18n()
const confirm = useDialog('confirm')

// Copy message content
const copyMessage = () => {
  if (isSupported.value) {
    copy(messageContent.value)
  } else {
    toast.add({ title: t("global.copyFailed"), color: 'red' })
  }
}

// Confirm and delete message
const confirmDeleteMessage = async () => {
  try {
    await confirm('Are you sure you want to delete this message?', {
      title: t('global.warning'),
      confirmText: t('global.delete'),
      cancelText: t('global.cancel')
    })
    emits('remove', props.message)
  } catch (error) {
    // User canceled - do nothing
  }
}

// Ref for the message content container
const messageContentRef = ref<HTMLElement>()

// Text selection for quick chat (only for assistant messages)
const isAssistantMessage = computed(() => props.message.role === 'assistant')
const showQuickChatButton = ref(false)
const buttonPosition = ref({ x: 0, y: 0 })
const selectedContent = ref('')

onMounted(() => {
  if (isAssistantMessage.value && messageContentRef.value) {
    // Custom selection handler for this message
    let cleanup: (() => void) | undefined
    
    const handleMouseUp = (event: MouseEvent) => {
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) return
        
        const selectedText = selection.toString().trim()
        if (!selectedText || selectedText.length < 3) return
        
        // Check if selection is within this message
        const range = selection.getRangeAt(0)
        if (!messageContentRef.value?.contains(range.commonAncestorContainer)) return
        
        const rect = range.getBoundingClientRect()
        const position = {
          x: rect.right + 10,
          y: rect.bottom + 10
        }
        
        // Show floating button instead of immediate dialog
        selectedContent.value = selectedText
        buttonPosition.value = position
        showQuickChatButton.value = true
      }, 50)
    }
    
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        handleMouseUp(event as any)
      }
    }
    
    // Add listeners to this message's content
    messageContentRef.value.addEventListener('mouseup', handleMouseUp)
    messageContentRef.value.addEventListener('keyup', handleKeyUp)
    
    cleanup = () => {
      if (messageContentRef.value) {
        messageContentRef.value.removeEventListener('mouseup', handleMouseUp)
        messageContentRef.value.removeEventListener('keyup', handleKeyUp)
      }
    }
    
    onUnmounted(() => {
      cleanup?.()
    })
  }
})

// Handle quick chat button actions
const handleQuickChatButtonClick = () => {
  // Emit to parent with message context when button is clicked
  emits('quick-chat', {
    selectedContent: selectedContent.value,
    position: buttonPosition.value,
    messageId: props.message.id || ''
  })
  showQuickChatButton.value = false
}

const handleQuickChatButtonClose = () => {
  showQuickChatButton.value = false
  selectedContent.value = ''
}

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
  <div class="flex flex-col my-2 group"
       :class="{ 'items-end': message.role === 'user' }">
    <MessageHeader 
      :role="message.role" 
      :model-name="modelName" 
      :time-used="timeUsed" 
    />
    <div class="leading-6 text-sm flex items-center max-w-full message-content"
         :class="{ 'text-gray-400 dark:text-gray-500': message.type === 'canceled', 'flex-row-reverse': !isModelMessage }">
      <div class="flex border border-primary/20 rounded-lg overflow-hidden box-border"
           :class="contentClass">
        <div v-if="contentDisplay === 'loading'" class="text-xl text-primary p-3">
          <span class="block i-svg-spinners-3-dots-scale"></span>
        </div>
        <template v-else-if="isModelMessage">
          <div class="p-3 overflow-hidden w-full">
            <ToolCallDisplay 
              :tool-calls="message.toolCalls || []" 
              :tool-results="message.toolResults" 
            />

            <!-- Text Content -->
            <div ref="messageContentRef" v-html="markdown.render(messageContent || '')" class="md-body" :class="{ 'line-clamp-3 max-h-[5rem]': !opened }" />

            <MessageImages :images="messageImages" />

            <Sources v-show="opened" :relevant_documents="message?.relevantDocs || []" />
          </div>
          <div class="flex flex-col">
            <MessageToggleCollapseButton v-if="showToggleButton" :opened="opened" @click="opened = !opened" />
            <ArtifactButton 
              v-if="detectedArtifact"
              class="artifact-btn"
              @click="toggleArtifact" 
            />
          </div>
        </template>
        <template v-else>
          <!-- User message with images -->
          <div class="p-3">
            <MessageImages :images="messageImages" class="mb-3" />
            <ModelMentionText v-if="messageContent" :content="messageContent" class="whitespace-break-spaces" />
          </div>
        </template>
      </div>
    </div>
    
    <MessageActionBar 
      :message="message" 
      :sending="sending"
      :align-right="message.role === 'user'"
      @copy="copyMessage"
      @fork="emits('fork', $event)"
      @resend="emits('resend', $event)"
      @remove="confirmDeleteMessage" 
    />
    
    <!-- Quick Chat Button -->
    <QuickChatButton
      :show="showQuickChatButton"
      :position="buttonPosition"
      @click="handleQuickChatButtonClick"
      @close="handleQuickChatButtonClose"
    />
  </div>
</template>

<style scoped>
.message-content:hover .artifact-btn {
  opacity: 1;
}

.preview-container {
  @apply border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 min-h-[100px];
}

.preview-container :deep(*) {
  margin: initial;
  padding: initial;
}
</style>
