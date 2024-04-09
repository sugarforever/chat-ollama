<script lang="ts" setup>
import { useClipboard } from '@vueuse/core'
import type { Message } from '~/components/Chat.vue'

const props = defineProps<{
  message: Message
  disabled?: boolean
}>()

const emits = defineEmits<{
  resend: []
  remove: []
}>()

const { copy, isSupported } = useClipboard({ legacy: true })
const permissionWrite = usePermission('clipboard-write')
const toast = useToast()

const buttons = [
  {
    label: 'Copy',
    icon: 'i-material-symbols-content-copy-outline',
    click: (e: MouseEvent) => {
      (e.currentTarget as any)?.focus()
      if (permissionWrite.value === 'denied') {
        toast.add({ title: 'Permission denied', color: 'red' })
        return
      }
      if (isSupported.value) {
        copy(props.message.content)
      } else {
        toast.add({ title: 'Copy failed', color: 'red' })
      }
    }
  },
  props.message.role === 'user'
    ? {
      label: 'Resend',
      icon: 'i-material-symbols-sync',
      click: () => {
        emits('resend')
      }
    }
    : [],
  {
    label: 'Remove',
    icon: 'i-material-symbols-delete-outline-rounded',
    click: () => {
      emits('remove')
    }
  },
].flat()

</script>

<template>
  <UDropdown :items="[buttons]"
             mode="hover"
             data-observer="ignore"
             :popper="{ placement: 'bottom', offsetDistance: 0 }"
             :ui="{ width: 'w-32' }">
    <slot />
  </UDropdown>
</template>
