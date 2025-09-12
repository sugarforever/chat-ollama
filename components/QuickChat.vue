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
  return {
    top: `${Math.min(y, window.innerHeight - 280)}px`,
    left: `${Math.min(x, window.innerWidth - 320)}px`
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
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="show"
        ref="dialogRef"
        :style="dialogStyle"
        class="quick-chat-dialog fixed z-[9999] max-w-[320px] w-[320px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl"
        @keydown="handleKeydown"
        @click="handleDialogClick"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-base font-medium text-gray-900 dark:text-gray-100">
            {{ t('quickChat.title') }}
          </h3>
          <UButton
            icon="i-heroicons-x-mark"
            color="gray"
            variant="ghost"
            size="xs"
            @click="handleClose"
          />
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
            @keydown="handleKeydown"
          />

          <div class="flex items-center justify-between mt-2">
            <div class="text-xs text-gray-400">
              {{ t('quickChat.shortcuts') }}
            </div>
            <UButton
              size="xs"
              :loading="isLoading"
              :disabled="!query.trim() || isLoading"
              @click="handleSubmit"
            >
              {{ isLoading ? t('quickChat.sending') : t('quickChat.send') }}
            </UButton>
          </div>
        </div>

        <!-- Response Area -->
        <div
          v-if="response || error || isLoading"
          class="p-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto"
        >
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
            <div class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
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

