<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModelItem } from '@/server/api/models/index.get'

const { t } = useI18n()
const { loadModels, models } = useModels({ forceReload: true })

const modelRows = computed(() => {
  return models.value.map((model) => {
    return {
      name: model.name,
      size: formatFileSize(model.size),
      family: model.details?.family,
      format: model.details?.format,
      parameter_size: model.details?.parameter_size,
      quantization_level: model.details?.quantization_level
    }
  })
})
const columns = computed(() => {
  return [
    { key: 'name', label: t('global.name') },
    { key: 'size', label: t('global.size') },
    { key: 'family', label: t('models.family') },
    { key: 'format', label: t('models.format') },
    { key: 'parameter_size', label: t('models.parameterSize') },
    { key: 'quantization_level', label: t('models.quantizationLevel') }
  ]
})

const selectedRows = ref<ModelItem[]>([])
const select = (row: ModelItem) => {
  const index = selectedRows.value.findIndex((item) => item.name === row.name)
  if (index === -1) {
    selectedRows.value.push(row)
  } else {
    selectedRows.value.splice(index, 1)
  }
}

const actions = [
  [{
    key: 'delete',
    label: t('global.delete'),
    icon: 'i-heroicons-trash-20-solid',
    click: async () => {
      isOpen.value = true
    }
  }]
]

// Modal
const isOpen = ref(false)
const onDeleteModel = async () => {
  resetModal()
  selectedRows.value.forEach(async ({ name }) => {
    const status = await $fetchWithAuth(`/api/models/`, {
      method: 'DELETE',
      body: {
        model: name
      },
      headers: getKeysHeader()
    })

    if (status?.status === 'success') {
      models.value = models.value.filter((m) => m.name !== name)
    }
  })
}

const onCancel = () => {
  resetModal()
}

const resetModal = () => {
  isOpen.value = false
}

function formatFileSize(bytes?: number) {
  if (bytes === undefined) return '-'
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <Download @modelDownloaded="loadModels" />
  <div class="mt-3 h-7">
    <UDropdown v-if="selectedRows.length > 0" :items="actions" :ui="{ width: 'w-36' }">
      <UButton icon="i-heroicons-chevron-down" trailing color="gray" size="xs">
        {{ t("global.operations") }}
      </UButton>
    </UDropdown>
  </div>

  <ClientOnly>
    <UTable :columns="columns" :rows="modelRows" @select="select" v-model="selectedRows" :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: t('global.noData') }"></UTable>
  </ClientOnly>

  <UModal v-model="isOpen">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
      <template #header>
        <span class="font-bold text-lg">{{ t("global.warning") }}</span>
      </template>

      <div>
        <p class="mb-4">{{ selectedRows.length > 1 ? t("models.deleteConfirm", ['s']) : t("models.deleteConfirm") }}?</p>
        <ul>
          <li class="font-bold" v-for="row in selectedRows" :key="row.name">{{ row.name }}</li>
        </ul>
      </div>

      <template #footer>
        <div class="flex flex-row gap-4">
          <UButton class="w-[80px] justify-center" color="primary" variant="solid" @click="onDeleteModel">{{ t("global.ok") }}</UButton>
          <UButton class="w-[80px] justify-center" color="white" variant="solid" @click="onCancel">{{ t("global.cancel") }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
