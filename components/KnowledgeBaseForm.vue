<script lang="ts" setup>
import type { KnowledgeBase } from '@prisma/client'
import { OPENAI_EMBEDDING_MODELS, GEMINI_EMBEDDING_MODELS } from '@/server/utils/models'

type OperateType = 'create' | 'update'

type EmbeddingModelType = {
  label: string,
  value: string,
  group: string,
  color: string
}

const embeddings = (() => {
  const embeddings_list = Array<EmbeddingModelType>()

  OPENAI_EMBEDDING_MODELS.forEach((item) => {
    embeddings_list.push({
      label: item,
      value: item,
      group: 'OpenAI',
      color: 'primary'
    })
  })

  GEMINI_EMBEDDING_MODELS.forEach((item) => {
    embeddings_list.push({
      label: item,
      value: item,
      group: 'Gemini',
      color: 'green'
    })
  })

  return embeddings_list
})()



const props = defineProps<{
  title: string
  type: OperateType
  data?: KnowledgeBase
  onSuccess: () => void
  onClose: () => void
}>()

const toast = useToast()
const state = reactive({
  files: [] as File[],
  name: props.data?.name || '',
  embedding: props.data?.embedding || undefined,
  description: props.data?.description || '',
  urls: '',
  pageParser: 'cheerio' as 'cheerio' | 'jinaReader'
})
const loading = ref(false)
const isModify = computed(() => props.type === 'update')
const parserList = [
  { label: 'Cheerio', value: 'cheerio' },
  { label: 'Jina Reader', value: 'jinaReader' },
]

async function onSubmit() {
  loading.value = true
  const formData = new FormData()

  if (state.urls.trim().length > 0) {
    state.urls
      .split(/[ \n]+/)
      .forEach((url: string) => formData.append('urls', url.trim()))
  }

  state.files.forEach((file, index) => {
    formData.append(`file_${index}`, file)
  })

  formData.append("name", state.name)
  formData.append("description", state.description)
  formData.append("embedding", state.embedding)
  formData.append("pageParser", state.pageParser)

  if (isModify.value) {
    formData.append('knowledgeBaseId', String(props.data!.id))
  }

  await submit(formData)

  loading.value = false
}

function validate(data: typeof state) {
  const errors = []
  if (!data.name) errors.push({ path: 'name', message: 'Required' })
  if (!data.embedding) errors.push({ path: 'embedding', message: 'Required' })
  return errors
}

async function submit(formData: FormData) {
  loading.value = true
  try {
    await $fetch(
      isModify.value ? `/api/knowledgebases/${props.data!.id}` : `/api/knowledgebases/`,
      {
        method: isModify.value ? 'PUT' : 'POST',
        body: formData,
        headers: {
          ...fetchHeadersOllama.value,
          ...fetchHeadersThirdApi.value,
        }
      }
    )
    props.onSuccess()
    props.onClose()
  } catch (e: any) {
    const msg = e.response._data?.message || e.message
    toast.add({ color: 'red', title: 'Tips', description: msg })
  }
  loading.value = false
}
</script>

<template>
  <UModal prevent-close>
    <UCard>
      <template #header>
        <div class="flex items-center">
          <span class="mr-auto">{{ title }}</span>
          <UButton icon="i-material-symbols-close-rounded" color="gray" @click="onClose()"></UButton>
        </div>
      </template>
      <UForm :state="state" :validate="validate" @submit="onSubmit">
        <UFormGroup label="Name" name="name" required class="mb-4">
          <UInput type="text" v-model="state.name" autocomplete="off" />
        </UFormGroup>

        <UFormGroup label="Embedding" name="embedding" :required="!isModify" class="mb-4">
          <USelectMenu v-model="state.embedding"
                       :options="embeddings"
                       option-attribute="label"
                       value-attribute="value"
                       :disabled="isModify"
                       searchable
                       creatable>
            <template #option="{ option }">
              <span class="block truncate">
                <UBadge :label="option.group" :color="option.color" size="xs" />&nbsp;
                {{ option.label }}
              </span>
            </template>

            <template #option-create="{ option }">
              <span class="flex-shrink-0">Click to use embedding:</span>
              <span class="flex-shrink-0 w-2 h-2 mt-px rounded-full -mx-1"></span>
              <span class="block truncate text-primary">{{ option }}</span>
            </template>
          </USelectMenu>
        </UFormGroup>

        <UFormGroup label="Description" name="description" class="mb-4">
          <UTextarea autoresize :maxrows="4" v-model="state.description" />
        </UFormGroup>

        <UFormGroup label="Files as Knowledge Base" name="file" class="mb-4">
          <FileSelector v-model="state.files" />
        </UFormGroup>

        <UFormGroup label="URLs as Knowledge Base" name="urls" class="mb-4">
          <UTextarea v-model="state.urls" autoresize :maxrows="6" placeholder="One per line" />
        </UFormGroup>

        <UFormGroup label="URL page parser" name="pageParser" class="mb-4">
          <USelectMenu v-model="state.pageParser" :options="parserList" value-attribute="value" />
        </UFormGroup>

        <div class="flex justify-end">
          <UButton color="gray" class="mr-2" @click="onClose()">Cancel</UButton>
          <UButton type="submit" :loading="loading">
            Save
          </UButton>
        </div>
      </UForm>
    </UCard>
  </UModal>
</template>
