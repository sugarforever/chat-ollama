<script setup lang="ts">
import { h, compile, defineComponent, onMounted, onUnmounted, watch } from 'vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  code: string
}>()

const sandboxId = ref(`sandbox-${Math.random().toString(36).substr(2, 9)}`)
const styleElement = ref<HTMLStyleElement | null>(null)

const extractSections = (code: string) => {
  const templateMatch = code.match(/<template>([\s\S]*)<\/template>/)
  const scriptMatch = code.match(/<script.*?>([\s\S]*)<\/script>/)
  const styleMatch = code.match(/<style[^>]*>([\s\S]*)<\/style>/)

  const isSetupScript = scriptMatch?.[0].includes('setup')

  return {
    template: templateMatch ? templateMatch[1].trim() : '',
    script: scriptMatch ? scriptMatch[1].trim() : '',
    isSetupScript,
    style: styleMatch ? styleMatch[1].trim() : '',
    hasScoped: styleMatch?.[0].includes('scoped') ?? false
  }
}

const injectStyles = (styles: string, isScoped: boolean) => {
  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }

  const style = document.createElement('style')
  let processedStyles = styles

  if (isScoped) {
    const scopeId = `data-v-${sandboxId.value}`
    processedStyles = styles.replace(/([^{}]*){/g, `[${scopeId}] $1 {`)
    const container = document.getElementById(sandboxId.value)
    if (container) {
      container.setAttribute(scopeId, '')
    }
  } else {
    processedStyles = styles.replace(/([^{}]*){/g, `#${sandboxId.value} $1 {`)
  }

  style.textContent = processedStyles
  document.head.appendChild(style)
  styleElement.value = style
}

const parsedSections = computed(() => extractSections(props.code))

const compiledComponent = computed(() => {
  try {
    const { template, script, isSetupScript } = parsedSections.value

    if (isSetupScript) {
      console.warn('Preview: <script setup> syntax is not fully supported in the preview.')
    }

    let componentOptions = {}
    if (script && !isSetupScript) {
      try {
        const cleanScript = script.replace('export default', 'return')
        componentOptions = new Function(cleanScript)()
      } catch (scriptError) {
        console.error('Failed to evaluate component script:', scriptError)
      }
    }

    const render = template ? compile(template) : null

    return defineComponent({
      ...componentOptions,
      render: render
    })
  } catch (e) {
    console.error('Failed to compile component:', e)
    return null
  }
})

// Handle styles separately using a watcher
watch(
  () => parsedSections.value,
  (sections) => {
    if (sections.style) {
      injectStyles(sections.style, sections.hasScoped)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }
})
</script>

<template>
  <div class="preview-sandbox" :id="sandboxId">
    <component v-if="compiledComponent" :is="compiledComponent" />
    <div v-else class="text-red-500">
      Failed to compile component. Check console for details.
    </div>
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
