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

const { t } = useI18n()
const { copy, isSupported } = useClipboard({ legacy: true })
const toast = useToast()

const buttons = computed(() => {
  return [
    {
      label: t('global.copy'),
      icon: 'i-material-symbols-content-copy-outline',
      click: (e: MouseEvent) => {
        (e.currentTarget as any)?.focus()
        if (isSupported.value) {
          copy(props.message.content)
        } else {
          toast.add({ title: t("global.copyFailed"), color: 'red' })
        }
      }
    },
    props.message.role === 'user'
      ? {
        label: t('chat.resend'),
        icon: 'i-material-symbols-sync',
        click: () => {
          emits('resend')
        }
      }
      : [],
    {
      label: t('global.remove'),
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
