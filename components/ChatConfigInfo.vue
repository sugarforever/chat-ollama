<script lang="ts" setup>
defineProps<{
  icon: string
  title?: string
  description?: string
}>()
</script>

<template>
  <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
    <UButton :icon="icon" color="gray" size="sm" class="cursor-default rounded-full" />
    <template #panel>
      <div class="p-2 text-sm max-w-[240px]">
        <h2>{{ title }}</h2>
        <div v-if="description" class="text-sm text-muted mt-2">{{ description }}</div>
      </div>
    </template>
  </UPopover>
</template>
