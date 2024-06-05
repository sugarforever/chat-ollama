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
      <div class="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 p-2 rounded hover:border-primary-400 hover:dark:border-primary-700"
           v-for="(relevant_document, index) in relevant_documents"
           :key="index">
        <UPopover mode="click">
          <div>
            <Source :source="relevant_document?.metadata?.source" />
            <pre class="line-clamp-3 text-gray-500 text-sm whitespace-break-spaces"
                 v-html="relevant_document?.pageContent" />
          </div>
          <template #panel>
            <div class="max-h-[40vh] overflow-auto">
              <pre class="p-4 text-gray-500 text-sm whitespace-break-spaces"
                   v-html="relevant_document?.pageContent" />
            </div>
          </template>
        </UPopover>
      </div>
    </div>
  </div>
</template>
