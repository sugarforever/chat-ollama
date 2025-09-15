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
    try {
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
    } catch (error) {
        console.error('Error in onEnter:', error)
    }
}

function onSubmit() {
    try {
        const event = new Event('submit', {
            bubbles: true,
            cancelable: true,
        })
        const formEl = getFormElement(textareaRef.value?.$el)
        if (formEl) {
            formEl.dispatchEvent(event)
        }
    } catch (error) {
        console.error('Error in TheTextarea onSubmit:', error)
    }
}

function getFormElement(el: HTMLElement | null): HTMLFormElement | null {
    if (el) {
        if (el.tagName === 'FORM') {
            return el as HTMLFormElement
        } else {
            return getFormElement(el.parentElement)
        }
    }
    return null
}

// Expose methods for cursor position
function getCursorPosition() {
    try {
        const textarea = textareaRef.value?.$el?.querySelector('textarea')
        return textarea?.selectionStart || 0
    } catch (error) {
        console.error('Error getting cursor position:', error)
        return 0
    }
}

function focus() {
    try {
        const textarea = textareaRef.value?.$el?.querySelector('textarea')
        textarea?.focus()
    } catch (error) {
        console.error('Error focusing textarea:', error)
    }
}

// Safe event emission functions
function onFocus() {
    try {
        emits('focus')
    } catch (error) {
        console.error('Error in onFocus:', error)
    }
}

function onBlur() {
    try {
        emits('blur')
    } catch (error) {
        console.error('Error in onBlur:', error)
    }
}

defineExpose({
    getCursorPosition,
    focus
})
</script>

<template>
    <UTextarea ref="textareaRef" v-model="value" :rows="rows" @keydown.enter.prevent="onEnter" @focus="onFocus"
               @blur="onBlur" />
</template>
