<script setup lang="ts">
import { useQuickChat } from '@/composables/useQuickChat'

interface Props {
  show: boolean
  selectedContent?: string
  position?: { x: number; y: number }
  currentModels?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  selectedContent: '',
  position: () => ({ x: 0, y: 0 }),
  currentModels: () => []
})

const emits = defineEmits<{
  (e: 'close'): void
  (e: 'update:show', value: boolean): void
}>()

const { t } = useI18n()
const quickChatOptions = computed(() => ({
  currentModels: props.currentModels
}))

const {
  query,
  response,
  isLoading,
  error,
  sendQuickChat,
  reset
} = useQuickChat(quickChatOptions)

const dialogRef = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()

const dialogStyle = computed(() => {
  const { x, y } = props.position
  
  // Smart positioning constants
  const DIALOG_WIDTH = 480  // Increased from 320px
  const DIALOG_MIN_HEIGHT = 280
  const DIALOG_MAX_HEIGHT = 600  // Maximum height when response is long
  const VIEWPORT_PADDING = 20
  const OFFSET_FROM_SELECTION = 10
  
  // Get viewport dimensions
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  
  // Calculate dynamic height based on content
  let estimatedHeight = DIALOG_MIN_HEIGHT
  if (response.value) {
    // Estimate height based on response length
    const responseLines = Math.ceil(response.value.length / 60) // ~60 chars per line
    const responseHeight = Math.min(responseLines * 20, 320) // Max 320px for response
    estimatedHeight = DIALOG_MIN_HEIGHT + responseHeight
  }
  estimatedHeight = Math.min(estimatedHeight, DIALOG_MAX_HEIGHT)
  
  // Smart horizontal positioning
  let left = x
  
  // Try to position to the right of selection first
  if (x + DIALOG_WIDTH + VIEWPORT_PADDING <= viewportWidth) {
    left = x + OFFSET_FROM_SELECTION
  }
  // If not enough space on right, try left
  else if (x - DIALOG_WIDTH - OFFSET_FROM_SELECTION >= VIEWPORT_PADDING) {
    left = x - DIALOG_WIDTH - OFFSET_FROM_SELECTION
  }
  // Center horizontally if neither side has enough space
  else {
    left = Math.max(VIEWPORT_PADDING, (viewportWidth - DIALOG_WIDTH) / 2)
  }
  
  // Smart vertical positioning
  let top = y
  
  // Try to position below selection first
  if (y + estimatedHeight + VIEWPORT_PADDING <= viewportHeight) {
    top = y + OFFSET_FROM_SELECTION
  }
  // If not enough space below, try above
  else if (y - estimatedHeight - OFFSET_FROM_SELECTION >= VIEWPORT_PADDING) {
    top = y - estimatedHeight - OFFSET_FROM_SELECTION
  }
  // Center vertically if neither position works
  else {
    top = Math.max(VIEWPORT_PADDING, (viewportHeight - estimatedHeight) / 2)
  }
  
  // Ensure dialog stays within viewport bounds
  left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - DIALOG_WIDTH - VIEWPORT_PADDING))
  top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - estimatedHeight - VIEWPORT_PADDING))
  
  return {
    top: `${top}px`,
    left: `${left}px`,
    maxHeight: `${DIALOG_MAX_HEIGHT}px`
  }
})

const handleSubmit = async () => {
  if (!query.value.trim() || isLoading.value) return

  await sendQuickChat(query.value, props.selectedContent)
}

const handleClose = () => {
  reset()
  emits('update:show', false)
  emits('close')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    handleClose()
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

// Focus input without clearing selection
const focusInput = () => {
  if (inputRef.value) {
    // Use preventScroll to avoid any layout shifts that might affect selection
    inputRef.value.focus({ preventScroll: true })
  }
}

// Prevent text selection from being cleared when clicking inside dialog
const handleDialogClick = (event: MouseEvent) => {
  // Prevent event from bubbling up which might clear selection
  event.stopPropagation()
}

// Focus input when dialog becomes visible
watch(() => props.show, (show) => {
  if (show) {
    nextTick(() => {
      setTimeout(() => {
        focusInput()
      }, 100)
    })
  }
})

// Close dialog when clicking outside
onMounted(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (props.show && dialogRef.value && !dialogRef.value.contains(event.target as Node)) {
      handleClose()
    }
  }

  document.addEventListener('mousedown', handleClickOutside)

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside)
  })
})
</script>

<template>
  <Teleport to="body">
    <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95">
      <div
           v-if="show"
           ref="dialogRef"
           :style="dialogStyle"
           class="quick-chat-dialog fixed z-[9999] w-[480px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl"
           @keydown="handleKeydown"
           @click="handleDialogClick">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-1 border-b border-gray-200 dark:border-gray-700">
          <UIcon name="i-heroicons-bolt" class="text-sm text-primary-500" />
          <UButton
                   icon="i-heroicons-x-mark"
                   color="gray"
                   variant="ghost"
                   size="xs"
                   @click="handleClose" />
        </div>

        <!-- Selected Content Display -->
        <div v-if="selectedContent" class="p-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t('quickChat.selectedText') }}:</div>
          <div class="text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-2 rounded border max-h-20 overflow-y-auto">
            {{ selectedContent }}
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-3">
          <textarea
                    ref="inputRef"
                    v-model="query"
                    class="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded resize-none focus:ring-1 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                    rows="2"
                    :placeholder="t('quickChat.placeholder')"
                    :disabled="isLoading"
                    @keydown="handleKeydown" />

          <div class="flex items-center justify-between mt-2">
            <div class="text-xs text-gray-400">
              {{ t('quickChat.shortcuts') }}
            </div>
            <UButton
                     size="xs"
                     :loading="isLoading"
                     :disabled="!query.trim() || isLoading"
                     @click="handleSubmit">
              {{ isLoading ? t('quickChat.sending') : t('quickChat.send') }}
            </UButton>
          </div>
        </div>

        <!-- Response Area -->
        <div
             v-if="response || error || isLoading"
             class="p-3 border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
          <!-- Loading State -->
          <div v-if="isLoading && !response" class="flex items-center text-gray-500 dark:text-gray-400 text-xs">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin mr-2 text-xs" />
            {{ t('quickChat.thinking') }}
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="text-red-600 dark:text-red-400 text-xs">
            <UIcon name="i-heroicons-exclamation-triangle" class="inline mr-1 text-xs" />
            {{ error }}
          </div>

          <!-- Response -->
          <div v-else-if="response">
            <div class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {{ response }}
            </div>
            <!-- Typing indicator when still loading but has content -->
            <div v-if="isLoading" class="flex items-center mt-2 text-gray-500 dark:text-gray-400">
              <div class="flex space-x-1">
                <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce"></div>
                <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce [animation-delay:0.1s]"></div>
                <div class="w-0.5 h-0.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quick-chat-dialog {
  backdrop-filter: blur(10px);
}
</style>
