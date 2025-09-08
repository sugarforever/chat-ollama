<script lang="ts" setup>
defineEmits<{
  click: []
}>()
</script>

<template>
  <UTooltip text="Preview" :popper="{ placement: 'left' }">
    <UButton 
      icon="i-heroicons-eye-20-solid"
      color="primary"
      variant="ghost"
      size="xs"
      class="mt-1 opacity-0 transition-all duration-300 ease-out hover:scale-105 hover:shadow-[0_4px_12px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_4px_12px_rgba(59,130,246,0.25)]"
      @click="$emit('click')" 
    />
  </UTooltip>
</template>