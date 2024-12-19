<script setup lang="ts">
import { compile, defineComponent, onUnmounted, watch, nextTick } from 'vue$'
import { computed } from 'vue'

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

const injectStyles = async (styles: string, isScoped: boolean) => {
  await nextTick()

  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }

  const style = document.createElement('style')
  let processedStyles = styles

  const uniquePrefix = `preview-${sandboxId.value}`

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

  style.setAttribute('data-preview-styles', uniquePrefix)
  style.textContent = processedStyles
  document.head.appendChild(style)
  styleElement.value = style
}

const setupComponent = async () => {
  await nextTick()
  if (parsedSections.value.style) {
    await injectStyles(parsedSections.value.style, parsedSections.value.hasScoped)
  }
}

const parsedSections = computed(() => extractSections(props.code))

const compiledComponent = computed(() => {
  try {
    const { template, script, isSetupScript } = parsedSections.value

    if (!template && !script) {
      console.warn('Preview: No template or script found')
      return null
    }

    let componentOptions = {}
    if (script && !isSetupScript) {
      try {
        const cleanScript = script.replace('export default', 'return')
        componentOptions = new Function(cleanScript)()
      } catch (scriptError) {
        console.error('Failed to evaluate component script:', scriptError)
        throw new Error('Script evaluation failed')
      }
    }

    const render = template ? compile(template, {
      onError: (err) => {
        console.error('Template compilation error:', err)
      },
      comments: true
    }) : null

    if (!render) {
      throw new Error('Failed to compile template')
    }

    return defineComponent({
      ...componentOptions,
      render
    })
  } catch (e) {
    console.error('Failed to compile component:', e)
    return null
  }
})

watch(
  () => props.code,
  async () => {
    await setupComponent()
  },
  { immediate: true }
)

onUnmounted(() => {
  if (styleElement.value) {
    document.head.removeChild(styleElement.value)
  }
  document.querySelectorAll(`style[data-preview-styles^="preview-"]`).forEach(el => {
    el.remove()
  })
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
