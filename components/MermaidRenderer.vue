<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'

const props = defineProps<{
  content: string
}>()

const container = ref<HTMLElement>()
const isLoading = ref(true)
const error = ref<string | null>(null)
const renderedId = ref(`mermaid-${Math.random().toString(36).substr(2, 9)}`)

const renderMermaid = async (content: string) => {
  if (!container.value || !content.trim()) return
  
  try {
    isLoading.value = true
    error.value = null
    
    // Import mermaid dynamically
    const mermaid = (await import('mermaid')).default
    
    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    })
    
    // Clear previous content
    container.value.innerHTML = ''
    
    // Generate a unique ID for this render
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Render the diagram
    const { svg } = await mermaid.render(id, content)
    
    // Insert the SVG
    container.value.innerHTML = svg
    
    isLoading.value = false
  } catch (err) {
    console.error('Mermaid rendering error:', err)
    error.value = err instanceof Error ? err.message : 'Failed to render diagram'
    isLoading.value = false
  }
}

watch(
  () => props.content,
  (newContent) => {
    if (newContent) {
      renderMermaid(newContent)
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.content) {
    renderMermaid(props.content)
  }
})
</script>

<template>
  <div class="mermaid-renderer">
    <div v-if="isLoading" class="flex items-center justify-center p-8 text-gray-500">
      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
      Rendering diagram...
    </div>
    
    <div v-else-if="error" class="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded border">
      <h4 class="font-semibold mb-2">Mermaid Error:</h4>
      <pre class="text-sm">{{ error }}</pre>
    </div>
    
    <div 
      v-else
      ref="container" 
      class="mermaid-container flex items-center justify-center p-4" 
    />
  </div>
</template>

<style scoped>
.mermaid-renderer {
  width: 100%;
  min-height: 200px;
}

.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>