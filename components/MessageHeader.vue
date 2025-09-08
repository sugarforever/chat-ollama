<script lang="ts" setup>
interface Props {
  role: 'user' | 'assistant'
  modelName?: { name: string; family: string }
  timeUsed?: number
}

defineProps<Props>()
</script>

<template>
  <div class="text-gray-500 dark:text-gray-400 p-1">
    <Icon v-if="role === 'user'" name="i-material-symbols-account-circle" class="text-lg" />
    <div v-else class="text-sm flex items-center">
      <UTooltip :text="modelName?.family" :popper="{ placement: 'top' }">
        <span class="text-primary/80">{{ modelName?.name }}</span>
      </UTooltip>
      <template v-if="timeUsed && timeUsed > 0">
        <span class="mx-2 text-muted/20 text-xs">|</span>
        <span class="text-gray-400 dark:text-gray-500 text-xs">{{ timeUsed }}s</span>
      </template>
    </div>
  </div>
</template>