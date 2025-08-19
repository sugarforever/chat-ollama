<script setup lang="ts">
interface Props {
  name?: string
  content: any
  toolCallId?: string
  expanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false
})

const isExpanded = ref(props.expanded)

const displayContent = computed(() => {
  if (typeof props.content === 'string') {
    return props.content
  }
  return JSON.stringify(props.content, null, 2)
})

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

const getToolIcon = (toolName: string) => {
  const iconMap: Record<string, string> = {
    'search': 'i-heroicons-magnifying-glass',
    'web_search': 'i-heroicons-magnifying-glass',
    'browser': 'i-heroicons-globe-alt',
    'file': 'i-heroicons-document',
    'calculator': 'i-heroicons-calculator',
    'code': 'i-heroicons-code-bracket',
    'default': 'i-heroicons-wrench-screwdriver'
  }
  
  const lowerName = toolName?.toLowerCase() || ''
  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key)) {
      return icon
    }
  }
  return iconMap.default
}
</script>

<template>
  <div class="my-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
    <!-- Tool header - always visible -->
    <div 
      class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      @click="toggleExpanded"
    >
      <div class="flex items-center space-x-2">
        <UIcon 
          :name="getToolIcon(name || '')" 
          class="w-4 h-4 text-blue-500"
        />
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ name || 'Tool' }}
        </span>
        <span v-if="toolCallId" class="text-xs text-gray-500 dark:text-gray-400">
          ({{ toolCallId.slice(0, 8) }}...)
        </span>
      </div>
      
      <div class="flex items-center space-x-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ isExpanded ? 'Hide details' : 'Show details' }}
        </span>
        <UIcon 
          :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          class="w-4 h-4 text-gray-500 transition-transform"
        />
      </div>
    </div>

    <!-- Tool content - expandable -->
    <div v-if="isExpanded" class="border-t border-gray-200 dark:border-gray-700">
      <div class="p-3">
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Tool Output:</div>
        <div class="bg-white dark:bg-gray-900 rounded border p-3 text-sm">
          <pre class="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-xs">{{ displayContent }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>