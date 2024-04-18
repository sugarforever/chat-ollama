<script lang="ts" setup>
import type { KnowledgeBase } from '@prisma/client'
import { OPENAI_EMBEDDING_MODELS, GEMINI_EMBEDDING_MODELS } from '@/server/utils/models'

type OperateType = 'create' | 'update'

const props = defineProps<{
  title: string
  type: OperateType
  data?: KnowledgeBase
  embeddings: string[]
  onSuccess: () => void
  onClose: () => void
}>()

const toast = useToast()
const state = reactive({
  files: [] as File[],
  name: props.data?.name || '',
  embedding: props.data?.embedding || '',
  description: props.data?.description || '',
  urls: '',
  pageParser: 'cheerio' as 'cheerio' | 'jinaReader'
})
const loading = ref(false)
const isModify = computed(() => props.type === 'update')
const embeddings = [
  generateEmbeddingData('Ollama', props.embeddings.filter(e => ![...OPENAI_EMBEDDING_MODELS, ...GEMINI_EMBEDDING_MODELS].includes(e)), 'group'),
  generateEmbeddingData('OpenAI', OPENAI_EMBEDDING_MODELS, 'group'),
  generateEmbeddingData('Gemini', GEMINI_EMBEDDING_MODELS, 'group'),
]
const embeddingList = computed(() => {
  const val = state.embedding.toLowerCase()
  return embeddings.flatMap(items => {
    const arr = items.filter(el => 'slot' in el || el.value.toLowerCase().includes(val))
    return arr.length > 1 ? [arr] : []
  })
})
const formRef = shallowRef()
const embeddingInputRef = shallowRef()
const showEmbeddingDropdown = ref(false)
const parserList = [
  { label: 'Cheerio', value: 'cheerio' },
  { label: 'Jina Reader', value: 'jinaReader' },
]

watch(embeddingList, (list) => {
  showEmbeddingDropdown.value = list.flat().length > 0
})

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

function generateEmbeddingData(groupName: string, list: string[], slotName: string) {
  if (list.length === 0) return []

  return [
    { label: groupName, disabled: true, slot: slotName },
    ...list.map(el => ({
      label: el,
      value: el,
      click: () => {
        state.embedding = el
        formRef.value.validate('embedding')
      }
    }))
  ]
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
      <UForm ref="formRef" :state="state" :validate="validate" @submit="onSubmit">
        <UFormGroup label="Name" name="name" required class="mb-4">
          <UInput type="text" v-model="state.name" autocomplete="off" />
        </UFormGroup>

        <UFormGroup label="Embedding" name="embedding" :required="!isModify" class="mb-4">
          <div class="flex">
            <UDropdown v-model:open="showEmbeddingDropdown"
                       :items="embeddingList"
                       :ui="{ item: { disabled: 'pointer-events-none' } }"
                       :popper="{ placement: 'bottom-start' }">
              <div></div>
              <template #group="{ item }">
                <div>{{ item.label }}</div>
              </template>
            </UDropdown>
            <UInput ref="embeddingInputRef" v-model="state.embedding" class="grow" autocomplete="off" @focus="showEmbeddingDropdown = true" />
          </div>
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
