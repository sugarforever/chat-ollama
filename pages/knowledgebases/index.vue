<script setup lang="ts">
import { fetchHeadersOllama, fetchHeadersThirdApi } from '@/utils/settings'
import { type KnowledgeBase } from '@prisma/client';

const toast = useToast()
const state = reactive({
  selectedFiles: '',
  name: '',
  embedding: '',
  description: '',
});

const validate = (data: typeof state) => {
  const errors = []
  if (!data.name) errors.push({ path: 'name', message: 'Required' })
  if (!data.embedding) errors.push({ path: 'embedding', message: 'Required' })
  return errors
}

const selectedFiles = ref([]);
const onFileChange = async (e: any) => {
  selectedFiles.value = e.target.files;
};
const loading = ref(false);
const onSubmit = async () => {
  loading.value = true;
  const formData = new FormData();
  Array.from(selectedFiles.value).forEach((file, index) => {
    console.log(`Index ${index}`, file);
    formData.append(`file_${index}`, file);
  });

  formData.append("name", state.name);
  formData.append("description", state.description);
  formData.append("embedding", state.embedding);

  try {
    await $fetch(`/api/knowledgebases/`, {
      method: 'POST',
      body: formData,
      headers: {
        ...fetchHeadersOllama.value,
        ...fetchHeadersThirdApi.value,
      }
    });
    reset()
    refresh();
  } catch (e: any) {
    const msg = e.response._data?.message || e.message;
    toast.add({ color: 'red', title: 'Tips', description: msg })
  }

  loading.value = false;
}

const { data, refresh } = await useFetch('/api/knowledgebases');

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'files', label: 'Files' },
  { key: 'description', label: 'Description' },
  { key: 'embedding', label: 'Embedding' },
  { key: 'actions' }
];

const knowledgeBases = computed(() => data.value?.knowledgeBases || []);


const actionsItems = (row: KnowledgeBase) => {
  return [[{
    label: 'Delete',
    icon: 'i-heroicons-trash-20-solid',
    click: () => onDelete(row.id)
  }]]
}

const onDelete = async (id: number) => {
  await $fetch(`/api/knowledgebases/${id}`, {
    method: 'DELETE',
    body: { id },
  });
  refresh();
}

function reset() {
  state.name = '';
  state.embedding = '';
  state.description = '';
  state.selectedFiles = '';
}
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="px-6 w-[400px]">
      <h2 class="font-bold text-xl mb-4">Create a New Knowledge Base</h2>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormGroup label="Name" name="name" required>
          <UInput type="text" v-model="state.name" />
        </UFormGroup>

        <UFormGroup label="Embedding" name="embedding" required>
          <UInput type="text" v-model="state.embedding" />
        </UFormGroup>

        <UFormGroup label="Description" name="description">
          <UTextarea autoresize :rows="2" v-model="state.description" />
        </UFormGroup>

        <UFormGroup label="File as Knowledge Base" name="file">
          <UInput multiple type="file" size="sm" accept=".txt,.json,.md,.doc,.docx,.pdf" v-model="state.selectedFiles"
            @change="onFileChange" />
        </UFormGroup>

        <UButton type="submit" :loading="loading">
          Save
        </UButton>
      </UForm>
    </div>
    <div class="flex flex-col flex-1 px-6">
      <h2 class="font-bold text-xl mb-4">Knowledge Bases</h2>
      <ClientOnly>
        <UTable :columns="columns" :rows="knowledgeBases">
          <template #name-data="{ row }">
            <ULink :to="`/knowledgebases/${row.id}`"
              class="text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 underline text-wrap">
              {{ row.name }}
            </ULink>
          </template>

          <template #files-data="{ row }">
            <div class="inline-flex">
              <UPopover mode="hover" :popper="{ placement: 'right' }">
                <UButton color="gray" :label="row.files.length" />
                <template #panel>
                  <ol class="p-2 list-decimal list-inside">
                    <li v-for="el in row.files" :key="el.id" class="my-1">{{ el.url }}</li>
                  </ol>
                </template>
              </UPopover>
            </div>
          </template>
          <template #description-data="{ row }">
            <span class="text-wrap">{{ row.description }}</span>
          </template>
          <template #actions-data="{ row }">
            <UDropdown :items="actionsItems(row)">
              <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
            </UDropdown>
          </template>
        </UTable>
      </ClientOnly>
    </div>
  </div>
</template>
