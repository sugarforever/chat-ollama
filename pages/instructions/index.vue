<script setup lang="ts">
import type { Instruction } from '@prisma/client'
import { loadOllamaInstructions } from "@/utils/settings"
import InstructionForm from '~/components/InstructionForm.vue'
import {useI18n} from "vue-i18n";
const { t } = useI18n()

const modal = useModal()
const confirm = useDialog('confirm')

const loading = ref(true)
const instructions = ref<Instruction[]>([])

const tableRows = computed(() => {
  return instructions.value.map((instruction) => {
    return {
      id: instruction.id,
      name: instruction.name,
      instruction: instruction.instruction,
    }
  })
})

const loadInstructions = async () => {
  instructions.value = await loadOllamaInstructions()
}

onMounted(() => {
  loadInstructions()
    .finally(() => {
      loading.value = false
    })
})

const ui = {
  td: {
    base: "whitespace-break-spaces",
  },
}

const columns = [
  { key: "name", label: t("Name") },
  { key: "instruction", label: t("Instruction") },
  { key: "actions" },
]

function onCreate() {
  modal.open(InstructionForm, {
    title: t('Create a new instruction'),
    type: 'create',
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(),
  })
}

async function onEdit(data: Instruction) {
  modal.open(InstructionForm, {
    title: t('Update instruction'),
    type: 'update',
    data,
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(),
  })
}

async function onDelete(data: Instruction) {
  confirm(`${t("Are you sure deleting instruction")} <b class="text-primary">${data.name}</b> ?`, {
    title: t('Delete Instruction'),
    dangerouslyUseHTMLString: true,
  })
    .then(async () => {
      try {
        await $fetchWithAuth(`/api/instruction/${data.id}`, {
          method: "DELETE",
        })
        await loadInstructions()
      } catch (e) {
        console.error(t("Failed to delete Ollama instruction"), e)
      }
    }).catch(noop)
}
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center mb-4">
      <h2 class="font-bold text-xl mr-auto">{{ t("Instruction") }}</h2>
      <UButton icon="i-material-symbols-add" @click="onCreate">
        {{ t("Create") }}
      </UButton>
    </div>
    <UTable :rows="tableRows" :columns :ui :loading class="w-full table-list" :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: t('No items.') }">
      <template #actions-data="{ row }">
        <div class="action-btn invisible flex">
          <UTooltip text="Update">
            <UButton icon="i-heroicons-pencil-square-solid" variant="ghost" class="mx-1" @click="onEdit(row)" />
          </UTooltip>
          <UTooltip text="Delete">
            <UButton color="red" icon="i-heroicons-trash-20-solid" variant="ghost" class="mx-1"
                     @click="onDelete(row)" />
          </UTooltip>
        </div>
      </template>
    </UTable>
  </div>
</template>
