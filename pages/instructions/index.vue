<script setup lang="ts">
import type { Instruction } from '@prisma/client'
import { loadOllamaInstructions } from "@/utils/settings"
import InstructionForm from '~/components/InstructionForm.vue'
import { useTools } from '~/composables/useTools'

const { t } = useI18n()
const modal = useModal()
const confirm = useDialog('confirm')
const { registerTool, unregisterTool } = useTools()

const loading = ref(true)
const instructions = ref<Instruction[]>([])

const tableRows = computed(() => {
  return instructions.value.map((instruction) => {
    return {
      id: instruction.id,
      name: instruction.name,
      instruction: instruction.instruction,
      class: instruction.isNew ? 'highlight-new' : ''
    }
  })
})

const loadInstructions = async (latestAsNew: boolean = false) => {
  instructions.value = await loadOllamaInstructions()
  if (latestAsNew) {
    const latestInstruction = instructions.value.reduce((max, current) => current.id > max.id ? current : max, { id: 0 })
    latestInstruction.isNew = true
  }
}

onMounted(() => {
  loadInstructions()
    .finally(() => {
      loading.value = false
    })

  registerTool({
    type: 'function',
    name: 'listInstructions',
    description: 'Lists all available instructions',
    handler: async () => {
      return {
        success: true,
        instructions: instructions.value.map(i => ({
          id: i.id,
          name: i.name,
          instruction: i.instruction
        }))
      }
    }
  })

  registerTool({
    type: 'function',
    name: 'createInstruction',
    description: 'Creates a new instruction',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the instruction' },
        instruction: { type: 'string', description: 'The instruction content' }
      }
    },
    handler: async (args) => {
      try {
        await $fetchWithAuth('/api/instruction', {
          method: 'POST',
          body: args
        })
        await loadInstructions()
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  })
})

onUnmounted(() => {
  unregisterTool('listInstructions')
  unregisterTool('createInstruction')
})

const ui = {
  td: {
    base: "whitespace-break-spaces",
  },
}

const columns = computed(() => {
  return [
    { key: "name", label: t("global.name") },
    { key: "instruction", label: t("instructions.instruction") },
    { key: "actions" },
  ]
})

function onCreate() {
  modal.open(InstructionForm, {
    title: t('instructions.createInstruction'),
    type: 'create',
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(true),
  })
}

async function onEdit(data: Instruction) {
  modal.open(InstructionForm, {
    title: t('instructions.updateInstruction'),
    type: 'update',
    data,
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(),
  })
}

async function onDelete(data: Instruction) {
  confirm(`${t("instructions.deleteConfirm")} <b class="text-primary">${data.name}</b> ?`, {
    title: t('instructions.deleteInstruction'),
    dangerouslyUseHTMLString: true,
  })
    .then(async () => {
      try {
        await $fetchWithAuth(`/api/instruction/${data.id}`, {
          method: "DELETE",
        })
        await loadInstructions()
      } catch (e) {
        console.error(t("instructions.deleteFailed"), e)
      }
    }).catch(noop)
}

const addInstruction = (instruction) => {
  instruction.isNew = true
  instructions.value.push(instruction)

  setTimeout(() => {
    instruction.isNew = false
  }, 2000)
}

</script>

<template>
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center mb-4">
      <h2 class="font-bold text-xl mr-auto">{{ t("instructions.instruction") }}</h2>
      <UButton icon="i-material-symbols-add" @click="onCreate">
        {{ t("global.create") }}
      </UButton>
    </div>
    <UTable
            :rows="tableRows"
            :columns="columns"
            :ui="ui"
            :loading="loading"
            class="w-full table-list"
            :empty-state="{ icon: 'i-heroicons-circle-stack-20-solid', label: t('global.noData') }"
            :row-class="(row) => row.class">
      <template #actions-data="{ row }">
        <div class="action-btn">
          <UTooltip :text="t('global.update')">
            <UButton icon="i-heroicons-pencil-square-solid" variant="ghost" class="mx-1" @click="onEdit(row)" />
          </UTooltip>
          <UTooltip :text="t('global.delete')">
            <UButton color="red" icon="i-heroicons-trash-20-solid" variant="ghost" class="mx-1"
                     @click="onDelete(row)" />
          </UTooltip>
        </div>
      </template>
    </UTable>
  </div>
</template>

<style scoped>
@keyframes highlightNew {
  0% {
    background-color: rgb(var(--color-primary-100));
  }

  100% {
    background-color: transparent;
  }
}

:deep(.highlight-new) {
  animation: highlightNew 2s ease-out forwards;
}
</style>
