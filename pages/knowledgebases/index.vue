<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { type KnowledgeBase } from '@prisma/client'
import { KnowledgeBaseForm } from '#components'

const { t } = useI18n()
const { token } = useAuth()
const router = useRouter()
const modal = useModal()
const confirm = useDialog('confirm')
const toast = useToast()
const currentSessionId = useStorage<number>('currentSessionId', 0)
const createChatSession = useCreateChatSession()

const { data, refresh } = await useFetch('/api/knowledgebases', {
  headers: {
    "Authorization": token.value!
  }
})

const columns = [
  { key: 'id', label: t('knowledgeBases.id') },
  { key: 'name', label: t('global.name') },
  { key: 'files', label: t('knowledgeBases.NoOfFiles') },
  { key: 'description', label: t('knowledgeBases.description') },
  { key: 'is_public', label: t('knowledgeBases.public') },
  { key: 'embedding', label: t('knowledgeBases.embedding') },
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
  confirm(t("knowledgeBases.deleteConfirm", [`<b class="text-primary">${row.name}</b>`]), {
    title: t('knowledgeBases.deleteTitle'),
    dangerouslyUseHTMLString: true,
  })
    .then(async () => {
      await $fetchWithAuth(`/api/knowledgebases/${row.id}`, {
        method: 'DELETE'
      }).catch((e) => {
        console.error(e)
        toast.add({
          title: t('global.error'),
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
    title: t('knowledgeBases.createTitle'),
    embeddings: embeddings.value,
    onClose: () => modal.close(),
    onSuccess: () => refresh()
  })
}

function onShowUpdate(data: KnowledgeBase) {
  modal.open(KnowledgeBaseForm, {
    type: 'update',
    title: t('knowledgeBases.updateTitle'),
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
      <h2 class="font-bold text-xl mr-auto">{{ t("menu.knowledgeBases") }}</h2>
      <UButton icon="i-material-symbols-add"
               @click="onShowCreate">
        {{ t("global.create") }}
      </UButton>
    </div>
    <ClientOnly>
      <UTable :columns="columns" :rows="knowledgeBases" class="table-list" :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: t('global.noData') }">
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
          <div class="action-btn">
            <UTooltip :text="t('global.update')">
              <UButton icon="i-heroicons-pencil-square-solid" variant="ghost" class="mx-1" @click="onShowUpdate(row)" />
            </UTooltip>
            <UTooltip :text="t('global.delete')">
              <UButton color="red" icon="i-heroicons-trash-20-solid" variant="ghost" class="mx-1"
                       @click="onDelete(row)" />
            </UTooltip>
          </div>
        </template>
      </UTable>
    </ClientOnly>
  </div>
</template>
