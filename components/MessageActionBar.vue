<script lang="ts" setup>
import type { ChatMessage } from '~/types/chat'

interface Props {
  message: ChatMessage
  sending?: boolean
  alignRight?: boolean
}

defineProps<Props>()

defineEmits<{
  copy: []
  fork: [message: ChatMessage]
  resend: [message: ChatMessage]
  remove: [message: ChatMessage]
}>()
</script>

<template>
  <div 
    v-if="!sending && message.type !== 'loading'" 
    class="flex items-center gap-1 mt-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    :class="alignRight ? 'justify-end' : 'justify-start'"
  >
    <!-- Copy Button -->
    <UTooltip :text="$t('global.copy')" :popper="{ placement: 'top' }">
      <UButton 
        icon="i-material-symbols-content-copy-outline" 
        color="gray" 
        variant="ghost" 
        size="xs"
        @click="$emit('copy')" 
      />
    </UTooltip>
    
    <!-- Fork Button -->
    <UTooltip :text="$t('chat.forkSession')" :popper="{ placement: 'top' }">
      <UButton 
        icon="i-heroicons-arrow-top-right-on-square" 
        color="gray" 
        variant="ghost" 
        size="xs"
        @click="$emit('fork', message)" 
      />
    </UTooltip>
    
    <!-- Resend Button (only for user messages) -->
    <UTooltip v-if="message.role === 'user'" :text="$t('chat.resend')" :popper="{ placement: 'top' }">
      <UButton 
        icon="i-material-symbols-sync" 
        color="gray" 
        variant="ghost" 
        size="xs"
        @click="$emit('resend', message)" 
      />
    </UTooltip>
    
    <!-- Remove Button -->
    <UTooltip :text="$t('global.remove')" :popper="{ placement: 'top' }">
      <UButton 
        icon="i-material-symbols-delete-outline-rounded" 
        color="red" 
        variant="ghost" 
        size="xs"
        @click="$emit('remove', message)" 
      />
    </UTooltip>
  </div>
</template>