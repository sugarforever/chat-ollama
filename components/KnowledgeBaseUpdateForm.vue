<script setup lang="ts">
import { KnowledgeBase } from '@prisma/client'

const props = defineProps<{
  knowledgeBase: KnowledgeBase,
  onClose: () => void
  onUpdated?: () => void
}>()

const toast = useToast()
const state = reactive({
  selectedFiles: '',
  urls: ''
})

const selectedFiles = ref([])
const onFileChange = async (e: any) => {
  selectedFiles.value = e.currentTarget?.files
}

const loading = ref(false)
const onSubmit = async () => {
  loading.value = true
  const formData = new FormData()
  state.urls
    .split(' ')
    .map((url: string) => url.trim())
    .forEach((url: string) => formData.append('urls', url))

  Array.from(selectedFiles.value).forEach((file, index) => {
    console.log(`Index ${index}`, file)
    formData.append(`file_${index}`, file)
  })

  try {
    await $fetch(`/api/knowledgebases/${props.knowledgeBase.id}`, {
      method: 'PUT',
      body: formData,
      headers: {
        ...fetchHeadersOllama.value,
        ...fetchHeadersThirdApi.value,
      }
    })

    props.onUpdated?.()
    props.onClose()
  } catch (e: any) {
    const msg = e.response._data?.message || e.message
    toast.add({ color: 'red', title: 'Tips', description: msg })
  } finally {
    loading.value = false
  }
}

</script>

<template>
  <UModal>
    <div class="p-6 w-full">
      <h2 class="font-bold text-xl mb-4">Update Knowledge Base</h2>
      <UForm :state="state" class="space-y-4" @submit="onSubmit">
        <UFormGroup label="Name" name="name">
          <h3>{{ knowledgeBase.name }}</h3>
        </UFormGroup>

        <UFormGroup label="Embedding" name="embedding">
          <h3>{{ knowledgeBase.embedding }}</h3>
        </UFormGroup>

        <UFormGroup label="Description" name="description">
          <h3>{{ knowledgeBase.description }}</h3>
        </UFormGroup>

        <UFormGroup label="Import More Files" name="file">
          <input type="file" class="text-sm" multiple name="file" accept=".txt,.json,.md,.doc,.docx,.pdf"
                 @change="onFileChange" />
        </UFormGroup>

        <UFormGroup label="Import More URLs" name="urls">
          <UTextarea v-model="state.urls" />
        </UFormGroup>

        <UButton type="submit" :loading="loading">
          Save
        </UButton>
      </UForm>
    </div>
  </UModal>
</template>
