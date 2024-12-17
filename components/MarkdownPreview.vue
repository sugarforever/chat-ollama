<script setup lang="ts">
const props = defineProps<{
  content: string
  show: boolean
}>()

const emits = defineEmits<{
  close: []
}>()

const markdown = useMarkdown()
</script>

<template>
  <div v-show="show"
       class="w-[400px] border-l dark:border-gray-800 flex flex-col h-[calc(100vh-64px)] shrink-0">
    <div class="p-4 border-b dark:border-gray-800 flex items-center">
      <span class="mr-auto font-bold">Preview</span>
      <UButton icon="i-material-symbols-close-rounded"
               color="gray"
               variant="ghost"
               size="sm"
               @click="emits('close')" />
    </div>
    <div class="flex-1 overflow-y-auto p-4">
      <div class="md-body" v-html="markdown.render(content || '')" />
    </div>
  </div>
</template>
