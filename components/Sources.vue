<script lang="ts" setup>
interface Metadata {
  source?: string
}

defineProps<{
  relevant_documents: Array<{
    metadata?: Metadata,
    pageContent?: string
  }>
}>()
</script>

<template>
  <div class="mt-4 pt-4" v-if="relevant_documents?.length > 0">
    <h3 class="flex flex-row items-center font-bold gap-1 text-lg mb-2">
      <UIcon name="i-heroicons-newspaper" /> Sources
    </h3>
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded"
           v-for="(relevant_document, index) in relevant_documents"
           :key="index">
        <h4 class="font-bold line-clamp-1 mb-2">{{ relevant_document?.metadata?.source }}</h4>
        <div class="line-clamp-1 text-gray-500 text-sm">
          {{ relevant_document?.pageContent }}
        </div>
      </div>
    </div>
  </div>
</template>
