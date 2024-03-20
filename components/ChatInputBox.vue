<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
import { type SubmitMode } from './TheTextarea.vue'

export interface ChatBoxFormData {
  content: string
}

const props = defineProps<{
  disabled?: boolean
  loading?: boolean
}>()

const emits = defineEmits<{
  submit: [data: ChatBoxFormData]
}>()

const submitMode = useStorage<SubmitMode>('sendMode', 'enter')
const state = reactive<ChatBoxFormData>({
  content: '',
})
const tip = computed(() => {
  return sendModeList[0].find(el => el.value === submitMode.value)?.label
})
const isFocus = ref(false)
const sendModeList = [
  [
    { label: 'Enter', value: 'enter', click: onChangeMode },
    { label: 'Shift + Enter', value: 'shift-enter', click: onChangeMode },
  ]
] as const
const disabledBtn = computed(() => {
  return props.disabled || !state.content.trim()
})

defineExpose({
  reset: onReset
})

function onChangeMode(this: typeof sendModeList[number][number]) {
  submitMode.value = this.value
}

function onSubmit() {
  if (props.disabled) return

  emits('submit', { ...state })
}

function onReset() {
  state.content = ''
}

</script>

<template>
  <div
    class="chat-box border rounded-lg p-2 transition-all transition-300 dark:bg-gray dark:border-gray-800 bg-white dark:bg-gray-700"
    :class="[isFocus ? 'shadow-lg' : 'shadow-md', { 'border-primary-400 dark:border-primary-900': isFocus }]">
    <UForm :state="state" @submit="onSubmit">
      <TheTextarea v-model="state.content" :max-rows="15" :min-rows="1" :submit-mode="submitMode"
        placeholder="Say something..." @focus="isFocus = true" @blur="isFocus = false" />
      <div class="flex">
        <div class="flex items-center ml-auto">
          <ClientOnly>
            <UButton type="submit" :disabled="disabledBtn" class="send-btn" icon="i-iconoir-send-diagonal"
              :loading="loading" loading-icon="i-iconoir-lens">
              <span class="text-xs tip-text" v-show="!loading">({{
      tip }})</span>
            </UButton>
            <UDropdown :items="sendModeList" :popper="{ placement: 'top-end' }">
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
</style>
