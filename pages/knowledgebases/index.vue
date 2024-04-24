<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { type KnowledgeBase } from '@prisma/client'
import { KnowledgeBaseForm } from '#components'

const { token } = useAuth()
const router = useRouter()
const modal = useModal()
const confirm = useDialog('confirm')
const toast = useToast()
const currentSessionId = useStorage<number>('currentSessionId', 0)

const { data, refresh } = await useFetch('/api/knowledgebases', {
  headers: {
    "Authorization": token.value!
  }
})

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'files', label: 'No. of Files' },
  { key: 'description', label: 'Description' },
  { key: 'is_public', label: 'Public' },
  { key: 'embedding', label: 'Embedding' },
  { key: 'actions' }
]

const knowledgeBases = computed(() => data.value?.knowledgeBases || [])
const embeddings = computed(() => [...new Set(data.value?.knowledgeBases?.flatMap(el => el.embedding || []) || [])])

async function onStartChat(data: KnowledgeBase) {
  const chatSessionInfo = await createChatSession({ title: data.name, knowledgeBaseId: data.id })
  currentSessionId.value = chatSessionInfo.id
  router.push('/chat')
}

const onDelete = async (row: KnowledgeBase) => {
  confirm(`Are you sure deleting knowledge base <b class="text-primary">${row.name}</b> ?`, {
    title: 'Delete Knowledge Base',
    dangerouslyUseHTMLString: true,
  })
    .then(async () => {
      await $fetchWithAuth(`/api/knowledgebases/${row.id}`, {
        method: 'DELETE'
      }).catch((e) => {
        console.error(e)
        toast.add({
          title: 'Error',
          description: e.statusMessage,
          color: 'red',
        })
      })
      refresh()
    })
    .catch(noop)
}

function onShowCreate() {
  modal.open(KnowledgeBaseForm, {
    type: 'create',
    title: 'Create a New Knowledge Base',
    embeddings: embeddings.value,
    onClose: () => modal.close(),
    onSuccess: () => refresh()
  })
}

function onShowUpdate(data: KnowledgeBase) {
  modal.open(KnowledgeBaseForm, {
    type: 'update',
    title: 'Update Knowledge Base',
    data,
    embeddings: embeddings.value,
    onClose: () => modal.close(),
    onSuccess: () => refresh()
  })
}
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center mb-4">
      <h2 class="font-bold text-xl mr-auto">Knowledge Bases</h2>
      <UButton icon="i-material-symbols-add"
               @click="onShowCreate">
        Create
      </UButton>
    </div>
    <ClientOnly>
      <UTable :columns="columns" :rows="knowledgeBases" class="table-list">
        <template #name-data="{ row }">
          <ULink class="text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 underline text-wrap text-left"
                 @click="onStartChat(row)">
            {{ row.name }}
          </ULink>
        </template>

        <template #files-data="{ row }">
          <div class="inline-flex">
            <UPopover mode="hover" :popper="{ placement: 'right' }">
              <UButton color="primary" variant="soft" :label="'' + row.files.length" />
              <template #panel>
                <ul class="p-2 list-inside">
                  <li v-for="el, i in row.files" :key="el.id" class="list-disc list-inside my-1 p-1">
                    {{ el.url }}
                  </li>
                </ul>
              </template>
            </UPopover>
          </div>
        </template>
        <template #description-data="{ row }">
          <span class="text-wrap">{{ row.description }}</span>
        </template>

        <template #is_public-data="{ row }">
          <div class="">
            <UIcon name="i-heroicons-check-16-solid text-primary" v-if="row.is_public" />
          </div>
        </template>

        <template #actions-data="{ row }">
          <div class="action-btn invisible flex">
            <UTooltip text="Update">
              <UButton icon="i-heroicons-pencil-square-solid" variant="ghost" class="mx-1" @click="onShowUpdate(row)" />
            </UTooltip>
            <UTooltip text="Delete">
              <UButton color="red" icon="i-heroicons-trash-20-solid" variant="ghost" class="mx-1"
                       @click="onDelete(row)" />
            </UTooltip>
          </div>
        </template>
      </UTable>
    </ClientOnly>
  </div>
</template>
