<script lang="ts" setup>
const props = defineProps<{
  source?: string
}>()

const isLink = computed(() => {
  return props.source?.startsWith('http://') || props.source?.startsWith('https://')
})
</script>

<template>
  <div class="font-bold line-clamp-1 mb-2">
    <a :href="props.source" v-if="isLink" class="underline" target="_blank" rel="noopener noreferrer">{{ props.source
      }}</a>
    <span v-else>{{ source }}</span>
  </div>
</template>
