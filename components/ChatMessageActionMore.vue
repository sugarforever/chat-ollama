<script lang="ts" setup>
import { useClipboard } from '@vueuse/core'
import type { Message } from '~/components/Chat.vue'
import {useI18n} from "vue-i18n";
const { t } = useI18n()

const props = defineProps<{
  message: Message
  disabled?: boolean
}>()

const emits = defineEmits<{
  resend: []
  remove: []
}>()

const { copy, isSupported } = useClipboard({ legacy: true })
const toast = useToast()

const buttons = computed(() => {
  return [
    {
      label: t('Copy'),
      icon: 'i-material-symbols-content-copy-outline',
      click: (e: MouseEvent) => {
        (e.currentTarget as any)?.focus()
        if (isSupported.value) {
          copy(props.message.content)
        } else {
          toast.add({ title: 'Copy failed', color: 'red' })
        }
      }
    },
    props.message.role === 'user'
      ? {
        label: t('Resend'),
        icon: 'i-material-symbols-sync',
        click: () => {
          emits('resend')
        }
      }
      : [],
    {
      label: t('Remove'),
      icon: 'i-material-symbols-delete-outline-rounded',
      click: () => {
        emits('remove')
      }
    },
  ].flat()
})

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
