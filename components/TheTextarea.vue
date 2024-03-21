<script lang="ts" setup>
import { useEventListener } from '@vueuse/core'
export type SubmitMode = 'enter' | 'shift-enter'

const emits = defineEmits<{
  submit: []
  focus: []
  blur: []
}>()
const props = defineProps<{
  maxRows: number
  minRows: number
  submitMode: SubmitMode
}>()
const value = defineModel<string>({ required: true })
const textareaRef = shallowRef()

const rows = computed(() => {
  const r = Math.min(props.maxRows, (value.value.match(/\n/g) || []).length + 1)
  return Math.max(props.minRows, r)
})

const composing = ref(false)
useEventListener(textareaRef, 'compositionstart', () => {
  composing.value = true
})
useEventListener(textareaRef, 'compositionend', () => {
  composing.value = false
})

function onEnter(e: KeyboardEvent) {
  if (composing.value) return

  e.preventDefault()
  if (props.submitMode === 'enter') {
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      value.value += '\n'
    } else if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      onSubmit()
    }
  } else {
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      onSubmit()
    } else {
      value.value += '\n'
    }
  }
}

function onSubmit() {
  const event = new Event('submit', {
    bubbles: true,
    cancelable: true,
  });
  getFormElement(textareaRef.value.$el)?.dispatchEvent(event)
}

function getFormElement(el: HTMLElement | null) {
  if (el) {
    if (el.tagName === 'FORM') {
      return el as HTMLFormElement
    } else {
      return getFormElement(el.parentElement)
    }
  }
  return null

}
</script>

<template>
  <UTextarea ref="textareaRef" v-model="value" :rows="rows" @keydown.enter.prevent="onEnter" @focus="emits('focus')"
    @blur="emits('blur')" />
</template>
