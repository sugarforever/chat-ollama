<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

export interface Artifact {
  id: string
  type: 'html' | 'vue' | 'svg' | 'mermaid' | 'javascript' | 'css'
  title: string
  content: string
  language?: string
}

const props = defineProps<{
  artifact: Artifact | null
  show: boolean
}>()

const emits = defineEmits<{
  close: []
  edit: [content: string]
  download: []
  share: []
}>()

const isEditing = ref(false)
const editableContent = ref('')
const sandboxId = ref(`artifact-${Math.random().toString(36).substr(2, 9)}`)

const artifactTypeLabels = {
  html: 'HTML Document',
  vue: 'Vue Component',
  svg: 'SVG Graphics',
  mermaid: 'Mermaid Diagram',
  javascript: 'JavaScript App',
  css: 'CSS Styles'
}

// Initialize editable content when artifact changes
watch(() => props.artifact?.content, (content) => {
  if (content) {
    editableContent.value = content
  }
}, { immediate: true })

const renderContent = computed(() => {
  if (!props.artifact) return ''
  
  const content = isEditing.value ? editableContent.value : props.artifact.content
  
  switch (props.artifact.type) {
    case 'html':
      return renderHTML(content)
    case 'vue':
      return content // Will be handled by VueRenderer
    case 'svg':
      return content
    case 'mermaid':
      return content // Will be handled by MermaidRenderer
    case 'javascript':
      return renderJavaScript(content)
    case 'css':
      return renderCSS(content)
    default:
      return content
  }
})

import { renderHTML, renderJavaScript, renderCSS } from '~/utils/artifactRenderers'

function toggleEdit() {
  if (isEditing.value) {
    // Save changes
    emits('edit', editableContent.value)
  }
  isEditing.value = !isEditing.value
}

function cancelEdit() {
  editableContent.value = props.artifact?.content || ''
  isEditing.value = false
}

function downloadArtifact() {
  emits('download')
}

function shareArtifact() {
  emits('share')
}

// Get appropriate file extension for download
const fileExtension = computed(() => {
  if (!props.artifact) return 'txt'
  
  switch (props.artifact.type) {
    case 'html': return 'html'
    case 'vue': return 'vue'
    case 'svg': return 'svg'
    case 'javascript': return 'js'
    case 'css': return 'css'
    case 'mermaid': return 'mmd'
    default: return 'txt'
  }
})
</script>

<template>
  <div v-show="show" 
       class="w-[500px] border-l dark:border-gray-800 flex flex-col shrink-0 h-full">
    <!-- Header -->
    <div class="p-4 border-b dark:border-gray-800 flex items-center gap-2 flex-shrink-0">
      <div class="flex-1">
        <h3 class="font-semibold text-sm">
          {{ artifact ? artifactTypeLabels[artifact.type] : 'Artifact' }}
        </h3>
        <p v-if="artifact?.title" class="text-xs text-gray-500 truncate">
          {{ artifact.title }}
        </p>
      </div>
      
      <!-- Controls -->
      <div class="flex gap-1">
        <UTooltip text="Edit">
          <UButton 
            :icon="isEditing ? 'i-heroicons-check' : 'i-heroicons-pencil'"
            :color="isEditing ? 'green' : 'gray'"
            variant="ghost"
            size="sm"
            @click="toggleEdit"
            :disabled="!artifact" />
        </UTooltip>
        
        <UTooltip text="Cancel" v-if="isEditing">
          <UButton 
            icon="i-heroicons-x-mark"
            color="gray"
            variant="ghost"
            size="sm"
            @click="cancelEdit" />
        </UTooltip>
        
        <UTooltip text="Download">
          <UButton 
            icon="i-heroicons-arrow-down-tray"
            color="gray"
            variant="ghost"
            size="sm"
            @click="downloadArtifact"
            :disabled="!artifact" />
        </UTooltip>
        
        <UTooltip text="Share">
          <UButton 
            icon="i-heroicons-share"
            color="gray"
            variant="ghost"
            size="sm"
            @click="shareArtifact"
            :disabled="!artifact" />
        </UTooltip>
        
        <UButton 
          icon="i-heroicons-x-mark"
          color="gray"
          variant="ghost"
          size="sm"
          @click="emits('close')" />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <div v-if="!artifact" class="flex-1 flex items-center justify-center text-gray-500">
        <div class="text-center">
          <UIcon name="i-heroicons-document" class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No artifact selected</p>
        </div>
      </div>
      
      <!-- Edit Mode -->
      <div v-else-if="isEditing" class="flex-1 flex flex-col min-h-0">
        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-gray-800 text-sm text-blue-700 dark:text-blue-300">
          Editing {{ artifact.title || 'artifact' }}
        </div>
        <div class="flex-1 min-h-0">
          <textarea 
            v-model="editableContent"
            class="w-full h-full resize-none p-4 border-0 focus:ring-0 bg-transparent font-mono text-sm"
            :placeholder="`Enter ${artifact.type} code here...`" />
        </div>
      </div>
      
      <!-- Display Mode -->
      <div v-else class="flex-1 overflow-hidden">
        <!-- HTML/JavaScript/CSS - use iframe -->
        <iframe 
          v-if="artifact.type === 'html' || artifact.type === 'javascript' || artifact.type === 'css'"
          :srcdoc="renderContent"
          class="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin" />
        
        <!-- Vue Component -->
        <div v-else-if="artifact.type === 'vue'" class="h-full overflow-auto p-4">
          <Suspense>
            <template #default>
              <VueRenderer :code="renderContent" />
            </template>
            <template #fallback>
              <div class="text-gray-500">Loading Vue component...</div>
            </template>
          </Suspense>
        </div>
        
        <!-- SVG -->
        <div v-else-if="artifact.type === 'svg'" class="h-full overflow-auto p-4 bg-white dark:bg-gray-900">
          <div v-html="renderContent" class="w-full h-full flex items-center justify-center" />
        </div>
        
        <!-- Mermaid -->
        <div v-else-if="artifact.type === 'mermaid'" class="h-full overflow-auto p-4">
          <MermaidRenderer :content="renderContent" />
        </div>
        
        <!-- Fallback -->
        <div v-else class="h-full overflow-auto p-4">
          <pre class="text-sm"><code>{{ renderContent }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>