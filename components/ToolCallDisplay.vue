<script lang="ts" setup>
interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
}

interface ToolResult {
  tool_call_id: string
  content: string
}

interface Props {
  toolCalls: ToolCall[]
  toolResults?: ToolResult[]
}

defineProps<Props>()
</script>

<template>
  <div v-if="toolCalls && toolCalls.length > 0" class="mb-3 space-y-3">
    <div v-for="toolCall in toolCalls" :key="toolCall.id">
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <!-- Tool Header -->
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-heroicons-cog-6-tooth" class="text-blue-600 dark:text-blue-400" />
          <span class="font-semibold text-blue-700 dark:text-blue-300">{{ toolCall.name }}</span>
        </div>

        <!-- Tool Parameters -->
        <details class="mb-3">
          <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
            View parameters
          </summary>
          <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">{{ JSON.stringify(toolCall.args, null, 2) }}</pre>
        </details>

        <!-- Tool Result -->
        <div v-if="toolResults && toolResults.find(r => r.tool_call_id === toolCall.id)"
             class="border-t border-blue-200 dark:border-blue-700 pt-3">
          <details>
            <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-2 transition-colors">
              <UIcon name="i-heroicons-check-circle" class="text-blue-600 dark:text-blue-400" />
              <span class="font-medium text-blue-700 dark:text-blue-300">View result</span>
            </summary>
            <div class="mt-2 text-sm bg-gray-50 dark:bg-gray-800/50 rounded p-2">
              <pre class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ toolResults.find(r => r.tool_call_id === toolCall.id)?.content }}</pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>