<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue'

const props = defineProps<{
  content: string
  show: boolean
}>()

const emits = defineEmits<{
  close: []
}>()

const isLoading = ref(false)

const loadPreview = async () => {
  isLoading.value = true
  try {
    await nextTick()
    // Additional loading logic if needed
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.content,
  async () => {
    await loadPreview()
  }
)

const extractedComponent = computed(() => {
  try {
    return props.content
  } catch (e) {
    console.error('Failed to extract component:', e)
    return ''
  }
})

watch(
  () => props.show,
  async (newVal) => {
    if (newVal) {
      await nextTick()
      // Force style refresh when preview is shown
      const sandbox = document.querySelector('.preview-sandbox')
      if (sandbox) {
        sandbox.classList.add('style-refresh')
        await nextTick()
        sandbox.classList.remove('style-refresh')
      }
    }
  }
)
</script>

<template>
  <div v-show="show"
       class="w-[400px] border-l dark:border-gray-800 flex flex-col h-[calc(100vh-64px)] shrink-0">
    <div class="p-4 border-b dark:border-gray-800 flex items-center">
      <span class="mr-auto font-bold">Component Preview</span>
      <UButton icon="i-material-symbols-close-rounded"
               color="gray"
               variant="ghost"
               size="sm"
               @click="emits('close')" />
    </div>
    <div class="flex-1 overflow-y-auto p-4">
      <Suspense>
        <template #default>
          <PreviewSandbox v-if="extractedComponent" :code="extractedComponent" />
          <div v-else class="text-gray-500">No valid component code found</div>
        </template>
        <template #fallback>
          <div class="text-gray-500">Loading preview...</div>
        </template>
      </Suspense>
    </div>
  </div>
</template>
