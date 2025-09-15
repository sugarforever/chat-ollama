<script lang="ts" setup>
import type { ModelInfo } from '~/composables/useModels'

const props = defineProps<{
  content: string
}>()

const { chatModels } = useModels()

// Parse and render @model mentions
const renderContent = computed(() => {
  if (!props.content) return ''
  
  // Updated regex to match model names with hyphens, colons, dots, and slashes
  const regex = /@([a-zA-Z0-9\-:._\/]+)/g
  
  return props.content.replace(regex, (match, modelName) => {
    // Try to find the model to get its display label
    const foundModel = chatModels.value.find(model => {
      // Direct name/label match
      if (model.name.toLowerCase() === modelName.toLowerCase() ||
          model.label.toLowerCase() === modelName.toLowerCase()) {
        return true
      }
      
      // Check if the query matches the full model value (for slash-prefixed models)
      if (model.value.toLowerCase() === modelName.toLowerCase()) {
        return true
      }
      
      // Check if the mentioned name matches the model part after the family separator
      const valueParts = model.value.split('/')
      if (valueParts.length > 1) {
        const modelPart = valueParts[valueParts.length - 1] // Get the last part (model name)
        return modelPart.toLowerCase() === modelName.toLowerCase()
      }

      return false
    })

    const fallbackParts = modelName.replace(/^\//, '').split('/')
    const fallbackLabel = fallbackParts[fallbackParts.length - 1] || modelName
    const displayName = foundModel ? foundModel.label : fallbackLabel
    const familyName = foundModel?.family || (fallbackParts.length > 1 ? fallbackParts.slice(0, -1).join('/') : '')
    const dataModelValue = foundModel ? foundModel.value : modelName

    return `<span class="model-mention" data-model="${dataModelValue}" data-family="${familyName}" data-label="${displayName}">@${displayName}</span>`
  })
})
</script>

<template>
  <div v-html="renderContent" class="model-mention-container" />
</template>

<style scoped>
.model-mention-container :deep(.model-mention) {
  @apply inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium;
  @apply bg-gray-100 text-gray-700 border border-gray-300;
  @apply dark:bg-gray-800/60 dark:text-gray-200 dark:border-gray-600;
  @apply transition-colors duration-150;
}

.model-mention-container :deep(.model-mention:hover) {
  @apply bg-gray-200 dark:bg-gray-700/70;
}
</style>
