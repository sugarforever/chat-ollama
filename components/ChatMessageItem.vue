<script lang="ts" setup>
import type { ChatMessage } from '~/types/chat'
import { defineAsyncComponent } from 'vue'
import { useKatexClient } from '~/composables/useKatexClient'

const props = defineProps<{
  message: ChatMessage
  sending: boolean
  showToggleButton?: boolean
  isPreviewing?: boolean
}>()

const emits = defineEmits<{
  resend: [message: ChatMessage]
  remove: [message: ChatMessage]
  preview: [content: string]
}>()

const markdown = useMarkdown()
// Initialize client-side KaTeX rendering
useKatexClient()

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

const showPreview = ref(false)

const previewComponent = ref<any>(null)
const isVueComponent = ref(false)

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

const togglePreview = () => {
  if (!messageContent.value) return

  const vueMatch = messageContent.value.match(/```vue\n([\s\S]*?)```/)
  if (vueMatch) {
    emits('preview', vueMatch[1])
  }
}

const extractTemplate = (code: string) => {
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/)
  return templateMatch ? templateMatch[1] : ''
}

const extractScript = (code: string) => {
  const scriptMatch = code.match(/<script.*>([\s\S]*)<\/script>/)
  return scriptMatch ? scriptMatch[1] : ''
}

const extractStyles = (code: string) => {
  const styleMatch = code.match(/<style.*>([\s\S]*)<\/style>/)
  return styleMatch ? styleMatch[1] : ''
}

const contentDisplay = computed(() => {
  if (props.isPreviewing && isModelMessage.value) {
    return isVueComponent.value ? 'component-preview' : 'preview-mode'
  }
  return props.message.type === 'loading' ? 'loading' : 'normal'
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
        <div v-else-if="contentDisplay === 'preview-mode'" class="p-3 flex items-center text-gray-500">
          <UIcon name="i-heroicons-document-text" class="mr-2" />
          <span>Content in preview</span>
        </div>
        <div v-else-if="contentDisplay === 'component-preview'" class="p-3 w-full">
          <div class="preview-container">
            <component :is="previewComponent" v-if="previewComponent" />
          </div>
        </div>
        <template v-else-if="isModelMessage">
          <div class="p-3 overflow-hidden">
            <!-- Image Gallery -->
            <div v-if="messageImages.length > 0" class="image-gallery mb-3 grid gap-2">
              <img v-for="(url, index) in messageImages"
                   :key="index"
                   :src="url"
                   class="rounded-lg max-h-64 object-contain"
                   :alt="`Image ${index + 1}`" />
            </div>
            <!-- Text Content -->
            <div v-html="markdown.render(messageContent || '')" class="md-body" :class="{ 'line-clamp-3 max-h-[5rem]': !opened }" />
            <Sources v-show="opened" :relevant_documents="message?.relevantDocs || []" />
          </div>
          <div class="flex flex-col">
            <MessageToggleCollapseButton v-if="showToggleButton" :opened="opened" @click="opened = !opened" />
            <UButton v-if="messageContent"
                     icon="i-heroicons-eye-20-solid"
                     color="gray"
                     variant="ghost"
                     size="xs"
                     class="mt-1 preview-btn"
                     :class="{ 'text-primary-500': isPreviewing }"
                     @click="togglePreview" />
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

  .preview-btn {
    opacity: 0;
    transition: opacity 0.3s;
  }

  &:hover {
    .preview-btn {
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
}
</style>
