<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
import { type SubmitMode } from './TheTextarea.vue'

export interface ChatBoxFormData {
  content: string
  images?: File[]
}

const props = defineProps<{
  disabled?: boolean
  loading?: boolean
}>()

const emits = defineEmits<{
  submit: [data: ChatBoxFormData]
  stop: []
}>()

const { isMobile } = useMediaBreakpoints()
const { t } = useI18n()
const submitMode = useStorage<SubmitMode>('sendMode', 'enter')
const state = reactive<ChatBoxFormData>({
  content: '',
  images: [],
})
const tip = computed(() => {
  const s = sendModeList.value[0].find(el => el.value === submitMode.value)?.label || ''
  return ` (${s})`
})
const isFocus = ref(false)
const sendModeList = computed(() => {
  return [
    [
      { label: t('chat.enter'), value: 'enter' as const, click: onChangeMode },
      { label: t('chat.shiftEnter'), value: 'shift-enter' as const, click: onChangeMode },
    ]
  ]
})
const disabledBtn = computed(() => {
  return props.disabled || (!props.loading && !state.content.trim() && (!state.images || state.images.length === 0))
})
const btnTip = computed(() => props.loading ? t('chat.stop') : (isMobile.value ? '' : tip.value))
const imagePreviewUrls = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()

defineExpose({
  reset: onReset
})

function onChangeMode(this: typeof sendModeList.value[number][number]) {
  submitMode.value = this.value
}

function onSubmit() {
  if (props.disabled) return

  emits('submit', { ...state })
}

function onStop(e: Event) {
  if (props.loading) {
    e.preventDefault()
    emits('stop')
  }
}

function onReset() {
  state.content = ''
  state.images = []
  
  // Clear existing preview URLs and revoke object URLs to prevent memory leaks
  imagePreviewUrls.value.forEach(url => {
    URL.revokeObjectURL(url)
  })
  imagePreviewUrls.value = []
  
  // Also reset the file input if it exists
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  console.log('Files selected:', input.files)
  
  // Convert FileList to array and filter for image files
  const fileArray = Array.from(input.files)
  state.images = fileArray.filter(file => file.type.startsWith('image/'))
  console.log('Image files:', state.images)
  
  // Generate preview URLs for the images
  imagePreviewUrls.value = []
  if (state.images && state.images.length > 0) {
    state.images.forEach(file => {
      const url = URL.createObjectURL(file)
      console.log('Created URL for', file.name, ':', url)
      imagePreviewUrls.value.push(url)
    })
    console.log('Preview URLs:', imagePreviewUrls.value)
  }
}

function removeImage(index: number) {
  if (state.images) {
    // Revoke the URL to prevent memory leaks
    URL.revokeObjectURL(imagePreviewUrls.value[index])
    
    // Remove the image from the arrays
    state.images = state.images.filter((_, i) => i !== index)
    imagePreviewUrls.value = imagePreviewUrls.value.filter((_, i) => i !== index)
  }
}

</script>

<template>
  <div
       class="chat-box border rounded-lg p-2 transition-all transition-300 dark:bg-gray dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
       :class="[isFocus ? 'shadow-lg shadow-primary-400/30 dark:shadow-primary-700/20' : '', { 'border-primary-400 dark:border-primary-700': isFocus }]">
    
    <!-- Image preview panel -->
    <div v-if="imagePreviewUrls.length > 0" class="image-preview-panel mb-2 flex flex-wrap gap-2">
      <div v-for="(url, index) in imagePreviewUrls" :key="index" class="image-preview-container relative">
        <img :src="url" class="image-preview rounded-md h-20 object-cover" />
        <button 
          @click="removeImage(index)" 
          class="remove-image-btn absolute top-1 right-1 rounded-full bg-gray-800/70 text-white p-1" 
          type="button"
        >
          <span class="i-heroicons-x-mark-20-solid w-3 h-3"></span>
        </button>
      </div>
    </div>
    
    <UForm :state="state" @submit="onSubmit">
      <TheTextarea v-model="state.content" :max-rows="15" :min-rows="2" :submit-mode="submitMode"
                   :placeholder="t('chat.saySomething')" @focus="isFocus = true" @blur="isFocus = false" />
      <div class="flex items-center">
        <div class="flex items-center">
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            class="hidden" 
            ref="fileInput" 
            @change="handleFileInputChange"
          />
          <UButton 
            variant="ghost" 
            color="gray" 
            @click="$refs.fileInput.click()"
          >
            <span class="i-heroicons-photo-20-solid w-5 h-5"></span>
          </UButton>
        </div>
        <slot></slot>
        <div class="flex items-center ml-auto">
          <ClientOnly>
            <UButton type="submit" :disabled="disabledBtn" :class="{ 'send-btn': !isMobile }"
                     :icon="loading ? 'i-iconoir-square' : 'i-iconoir-send-diagonal'" @click="onStop">
              <span class="text-xs tip-text" v-show="btnTip">{{ btnTip }}</span>
            </UButton>
            <UDropdown v-if="!isMobile" :items="sendModeList" :popper="{ placement: 'top-end' }">
              <UButton trailing-icon="i-heroicons-chevron-down-20-solid" class="arrow-btn" />
            </UDropdown>
          </ClientOnly>
        </div>
      </div>
    </UForm>
  </div>
</template>

<style scoped>
.chat-box :deep() {
  textarea {
    outline: none;
    border: none;
    box-shadow: none;
    background: transparent;
  }

  .send-btn {
    border-bottom-right-radius: 0;
    border-top-right-radius: 0;
  }

  .arrow-btn {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid rgb(var(--color-primary-400));
  }

  .tip-text {
    color: rgb(var(--color-primary-200));
  }
}

.image-preview-panel {
  max-height: 160px;
  overflow-y: auto;
}

.image-preview-container {
  border-radius: 8px;
  overflow: hidden;
}

.image-preview {
  width: auto;
  max-width: 150px;
}

.remove-image-btn {
  transition: opacity 0.2s;
  opacity: 0.8;
}

.remove-image-btn:hover {
  opacity: 1;
}
</style>
