<script setup lang="ts">
import type { Instruction } from '@prisma/client'
import InstructionForm from '~/components/InstructionForm.vue'
import { useTools } from '~/composables/useTools'

// Instructions feature is now always enabled

const { t } = useI18n()
const modal = useModal()
const confirm = useDialog('confirm')
const { registerTool, unregisterTool } = useTools()
const { data: session } = useAuth()

const loading = ref(true)
const instructions = ref<Instruction[]>([])


const { getInstructions, clearCache } = useInstructionsCache()

const loadInstructions = async (latestAsNew: boolean = false, forceRefresh: boolean = false) => {
  if (forceRefresh) {
    // Instead of clearing cache immediately, fetch fresh data first
    const freshInstructions = await getInstructions(true) // Pass true to force refresh
    instructions.value = freshInstructions
  } else {
    instructions.value = await getInstructions()
  }
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
      if (!session.value?.user) {
        return { success: false, error: 'Authentication required to create instructions' }
      }

      try {
        await $fetchWithAuth('/api/instruction', {
          method: 'POST',
          body: args
        })
        await loadInstructions(true, true)
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
  })

  registerTool({
    type: 'function',
    name: 'deleteInstruction',
    description: 'Deletes an instruction by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the instruction' }
      }
    },
    handler: async (args) => {
      try {
        const instruction = instructions.value.find(i => i.name === args.name)
        if (!instruction) {
          return { success: false, error: 'Instruction not found' }
        }

        await $fetchWithAuth(`/api/instruction/${instruction.id}`, {
          method: "DELETE",
        })
        await loadInstructions(false, true)
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
  unregisterTool('deleteInstruction')
})


function onCreate() {
  modal.open(InstructionForm, {
    title: t('instructions.createInstruction'),
    type: 'create',
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(true, true),
  })
}

async function onEdit(data: Instruction) {
  modal.open(InstructionForm, {
    title: t('instructions.updateInstruction'),
    type: 'update',
    data,
    onClose: () => modal.close(),
    onSuccess: () => loadInstructions(false, true),
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
        await loadInstructions(false, true)
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

const canEditInstruction = (instruction: any) => {
  // If user is not logged in, can only edit legacy instructions (user_id is null)
  if (!session.value?.user) {
    return instruction.user_id === null
  }

  // User can edit their own instructions or legacy instructions
  return instruction.user_id === session.value.user.id || instruction.user_id === null
}

const canDeleteInstruction = (instruction: any) => {
  // Same logic as edit for now
  return canEditInstruction(instruction)
}

</script>

<template>
  <div class="max-w-7xl mx-auto p-6">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ t("instructions.instruction") }}</h1>
        <p class="text-lg text-gray-600 dark:text-gray-400 mt-2">Manage your AI instructions and prompts</p>
      </div>
      <UButton 
        v-if="session?.id" 
        icon="i-material-symbols-add" 
        size="lg"
        class="px-6 py-3"
        @click="onCreate"
      >
        {{ t("global.create") }}
      </UButton>
    </div>

    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div v-for="i in 6" :key="i" class="animate-pulse">
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 h-48">
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
          <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3"></div>
          <div class="flex justify-between items-center mt-auto">
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div class="flex gap-2">
              <div class="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="instructions.length === 0" class="text-center py-16">
      <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <UIcon name="i-heroicons-circle-stack-20-solid" class="w-8 h-8 text-gray-400" />
      </div>
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">{{ t('global.noData') }}</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6">Get started by creating your first instruction</p>
      <UButton 
        v-if="session?.id" 
        icon="i-material-symbols-add" 
        @click="onCreate"
        size="lg"
      >
        {{ t("global.create") }}
      </UButton>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div 
        v-for="instruction in instructions" 
        :key="instruction.id"
        :class="[
          'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 p-6 flex flex-col',
          instruction.isNew ? 'highlight-new' : ''
        ]"
      >
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2 leading-6">
            {{ instruction.name }}
          </h3>
          <UBadge 
            :color="instruction.is_public ? 'green' : 'orange'" 
            variant="soft"
            class="flex-shrink-0"
          >
            {{ instruction.is_public ? t('instructions.public') : t('instructions.private') }}
          </UBadge>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-grow line-clamp-3 leading-relaxed">
          {{ instruction.instruction }}
        </p>

        <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
          <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
            <UIcon name="i-heroicons-user-20-solid" class="w-3 h-3 mr-1" />
            <span class="truncate max-w-[120px]">
              {{ instruction.user?.name || 'Unknown' }}
            </span>
          </div>
          <div class="flex gap-1">
            <UTooltip v-if="canEditInstruction(instruction)" :text="t('global.update')">
              <UButton 
                icon="i-heroicons-pencil-square-solid" 
                variant="ghost" 
                size="sm"
                color="gray"
                @click="onEdit(instruction)" 
              />
            </UTooltip>
            <UTooltip v-if="canDeleteInstruction(instruction)" :text="t('global.delete')">
              <UButton 
                color="red" 
                icon="i-heroicons-trash-20-solid" 
                variant="ghost" 
                size="sm"
                @click="onDelete(instruction)" 
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes highlightNew {
  0% {
    background-color: rgb(var(--color-primary-100));
    transform: scale(1.02);
  }
  100% {
    background-color: transparent;
    transform: scale(1);
  }
}

.highlight-new {
  animation: highlightNew 2s ease-out forwards;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
