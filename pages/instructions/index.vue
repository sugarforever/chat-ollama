<script setup lang="ts">
import type { Instruction } from '@prisma/client'
import { loadOllamaInstructions } from "@/utils/settings"
import InstructionForm from '~/components/InstructionForm.vue'

const modal = useModal()

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
  { key: "name", label: "Name" },
  { key: "instruction", label: "Instruction" },
  { key: "actions" },
]

function onCreate() {
  modal.open(InstructionForm, {
    title: 'Create a new instruction',
    type: 'create',
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(),
  })
}

async function onEdit(data: Instruction) {
  modal.open(InstructionForm, {
    title: 'Update instruction',
    type: 'update',
    data,
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(),
  })
}

const onDelete = async (id: number) => {
  try {
    await $fetch(`/api/instruction/${id}`, {
      method: "DELETE",
    })
    await loadInstructions()
  } catch (e) {
    console.error("Failed to delete Ollama instruction", e)
  }
};

</script>
<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center mb-4">
      <h2 class="font-bold text-xl mr-auto">Instruction</h2>
      <UButton icon="i-material-symbols-add" @click="onCreate">
        Create
      </UButton>
    </div>
    <UTable :rows="tableRows" :columns :ui :loading class="w-full table-list">
      <template #actions-data="{ row }">
        <div class="action-btn invisible flex">
          <UTooltip text="Update">
            <UButton icon="i-heroicons-pencil-square-solid" variant="ghost" class="mx-1" @click="onEdit(row)" />
          </UTooltip>
          <UTooltip text="Delete">
            <UButton color="red" icon="i-heroicons-trash-20-solid" variant="ghost" class="mx-1"
                     @click="onDelete(row.id)" />
          </UTooltip>
        </div>
      </template>
    </UTable>
  </div>
</template>
