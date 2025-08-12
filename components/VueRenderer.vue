<script setup lang="ts">
import { compile, defineComponent, onUnmounted, watch, nextTick, ref, computed } from 'vue'

const props = defineProps<{
  code: string
}>()

const sandboxId = ref(`vue-renderer-${Math.random().toString(36).substr(2, 9)}`)
const styleElement = ref<HTMLStyleElement | null>(null)
const error = ref<string | null>(null)

const extractSections = (code: string) => {
  const templateMatch = code.match(/<template[^>]*>([\s\S]*)<\/template>/)
  const scriptMatch = code.match(/<script[^>]*>([\s\S]*)<\/script>/)
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

  const uniquePrefix = `vue-renderer-${sandboxId.value}`

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

  style.setAttribute('data-vue-renderer-styles', uniquePrefix)
  style.textContent = processedStyles
  document.head.appendChild(style)
  styleElement.value = style
}

const parsedSections = computed(() => extractSections(props.code))

const compiledComponent = computed(() => {
  try {
    error.value = null
    const { template, script, isSetupScript } = parsedSections.value

    if (!template && !script) {
      throw new Error('No template or script found')
    }

    let componentOptions = {}
    if (script && !isSetupScript) {
      try {
        const cleanScript = script.replace(/export\s+default\s*/, 'return ')
        componentOptions = new Function(`"use strict"; ${cleanScript}`)()
      } catch (scriptError) {
        console.error('Script evaluation error:', scriptError)
        throw new Error(`Script evaluation failed: ${scriptError}`)
      }
    }

    const render = template ? compile(template, {
      onError: (err) => {
        console.error('Template compilation error:', err)
        throw err
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
    console.error('Component compilation error:', e)
    error.value = e instanceof Error ? e.message : 'Unknown compilation error'
    return null
  }
})

const setupComponent = async () => {
  await nextTick()
  if (parsedSections.value.style) {
    await injectStyles(parsedSections.value.style, parsedSections.value.hasScoped)
  }
}

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
  document.querySelectorAll(`style[data-vue-renderer-styles^="vue-renderer-"]`).forEach(el => {
    el.remove()
  })
})
</script>

<template>
  <div class="vue-renderer" :id="sandboxId">
    <div v-if="error" class="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded border">
      <h4 class="font-semibold mb-2">Compilation Error:</h4>
      <pre class="text-sm">{{ error }}</pre>
    </div>
    
    <component v-else-if="compiledComponent" :is="compiledComponent" />
    
    <div v-else class="text-gray-500 p-4">
      Loading Vue component...
    </div>
  </div>
</template>

<style scoped>
.vue-renderer {
  min-height: 100px;
}
</style>