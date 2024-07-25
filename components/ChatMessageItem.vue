<script lang="ts" setup>
import type { ChatMessage } from '~/types/chat'

const props = defineProps<{
  message: ChatMessage
  sending: boolean
  showToggleButton?: boolean
}>()

const emits = defineEmits<{
  resend: [message: ChatMessage]
  remove: [message: ChatMessage]
}>()

const markdown = useMarkdown()

const opened = ref(props.showToggleButton === true ? false : true)
const isModelMessage = computed(() => props.message.role === 'assistant')
const contentClass = computed(() => {
  return [
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
        <div v-if="message.type === 'loading'" class="text-xl text-primary p-3">
          <span class="block i-svg-spinners-3-dots-scale"></span>
        </div>
        <template v-else-if="isModelMessage">
          <div class="p-3 overflow-hidden">
            <div v-html="markdown.render(message.content || '')" class="md-body" :class="{ 'line-clamp-3 max-h-[5rem]': !opened }" />
            <Sources v-show="opened" :relevant_documents="message?.relevantDocs || []" />
          </div>
          <MessageToggleCollapseButton v-if="showToggleButton" :opened="opened" @click="opened = !opened" />
        </template>
        <pre v-else v-text="message.content" class="p-3 whitespace-break-spaces" />
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
}
</style>
