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
  stop: []
}>()

const { isMobile } = useMediaBreakpoints()
const { t } = useI18n()
const submitMode = useStorage<SubmitMode>('sendMode', 'enter')
const state = reactive<ChatBoxFormData>({
  content: '',
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
  return props.disabled || (!props.loading && !state.content.trim())
})
const btnTip = computed(() => props.loading ? t('chat.stop') : (isMobile.value ? '' : tip.value))

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
}

</script>

<template>
  <div
       class="chat-box border rounded-lg p-2 transition-all transition-300 dark:bg-gray dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
       :class="[isFocus ? 'shadow-lg shadow-primary-400/30 dark:shadow-primary-700/20' : '', { 'border-primary-400 dark:border-primary-700': isFocus }]">
    <UForm :state="state" @submit="onSubmit">
      <TheTextarea v-model="state.content" :max-rows="15" :min-rows="2" :submit-mode="submitMode"
                   :placeholder="t('chat.saySomething')" @focus="isFocus = true" @blur="isFocus = false" />
      <div class="flex items-center">
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
</style>
