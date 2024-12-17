<script setup lang="ts">
import { h, compile, defineComponent, onMounted, onUnmounted } from 'vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  code: string
}>()

const sandboxId = ref(`sandbox-${Math.random().toString(36).substr(2, 9)}`)
const styleElement = ref<HTMLStyleElement | null>(null)

const extractSections = (code: string) => {
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/)
  const scriptMatch = code.match(/<script>([\s\S]*)<\/script>/)
  const styleMatch = code.match(/<style[^>]*>([\s\S]*)<\/style>/)

  return {
    template: templateMatch ? templateMatch[1].trim() : '',
    script: scriptMatch ? scriptMatch[1].trim() : '',
    style: styleMatch ? styleMatch[1].trim() : ''
  }
}

const injectStyles = (styles: string) => {
  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }

  // Create a new style element
  const style = document.createElement('style')
  // Scope styles to our sandbox container
  const scopedStyles = styles.replace(/([^{}]*){/g, `#${sandboxId.value} $1 {`)
  style.textContent = scopedStyles
  document.head.appendChild(style)
  styleElement.value = style
}

const compiledComponent = computed(() => {
  try {
    const { template, script, style } = extractSections(props.code)

    // Handle styles
    if (style) {
      injectStyles(style)
    }

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

// Clean up styles when component is unmounted
onUnmounted(() => {
  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }
})
</script>

<template>
  <div class="preview-sandbox" :id="sandboxId">
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
