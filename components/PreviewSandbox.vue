<script setup lang="ts">
import { h, compile, defineComponent } from 'vue'
import { computed } from 'vue'

const props = defineProps<{
  code: string
}>()

const extractSections = (code: string) => {
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/)
  const scriptMatch = code.match(/<script>([\s\S]*)<\/script>/)

  return {
    template: templateMatch ? templateMatch[1].trim() : '',
    script: scriptMatch ? scriptMatch[1].trim() : ''
  }
}

const compiledComponent = computed(() => {
  try {
    const { template, script } = extractSections(props.code)

    // Evaluate script section to get component options
    let componentOptions = {}
    if (script) {
      // Remove 'export default' and evaluate as object
      const cleanScript = script.replace('export default', 'return')
      componentOptions = new Function(cleanScript)()
    }

    // Compile template
    const render = template ? compile(template) : null

    // Create component with both template and data/methods
    return defineComponent({
      ...componentOptions,
      render: render
    })
  } catch (e) {
    console.error('Failed to compile component:', e)
    return null
  }
})
</script>

<template>
  <div class="preview-sandbox">
    <component v-if="compiledComponent" :is="compiledComponent" />
    <div v-else class="text-red-500">Failed to compile component</div>
  </div>
</template>

<style scoped>
.preview-sandbox {
  padding: 1rem;
  border: 1px solid var(--color-gray-200);
  border-radius: 0.5rem;
  background: var(--color-white);
}

:deep(.dark) .preview-sandbox {
  border-color: var(--color-gray-700);
  background: var(--color-gray-900);
}
</style>
