<script lang="ts" setup>
import type { Instruction } from '@prisma/client'
import { InstructionForm } from '#components'

const props = defineProps<{
    agentInstruction: string
    onClose: () => void
    onUpdated?: (instruction: string) => void
}>()

const { t } = useI18n()
const modal = useModal()

const state = reactive({
    instructionId: 0,
    customInstruction: props.agentInstruction
})

const instructions = ref<Instruction[]>([])
const loading = ref(true)

const { getInstructions } = useInstructionsCache()

// Load instructions
const loadInstructions = async () => {
    try {
        const loadedInstructions = await getInstructions()
        instructions.value = loadedInstructions as Instruction[]
        // Try to match current instruction with existing ones
        const matchingInstruction = instructions.value.find(inst =>
            inst.instruction === props.agentInstruction
        )
        if (matchingInstruction) {
            state.instructionId = matchingInstruction.id
        }
    } catch (error) {
        console.error('Failed to load instructions:', error)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadInstructions()
})

const instructionContent = computed(() => {
    if (state.instructionId === 0) {
        return state.customInstruction
    }
    return instructions.value.find(el => el.id === state.instructionId)?.instruction || ''
})

watch(() => state.instructionId, (newValue) => {
    if (newValue !== 0) {
        const instruction = instructions.value.find(el => el.id === newValue)
        if (instruction) {
            state.customInstruction = instruction.instruction
        }
    }
})

function onCreateInstruction() {
    modal.open(InstructionForm, {
        title: t('instructions.createInstruction'),
        type: 'create',
        onClose: () => modal.close(),
        onSuccess: () => loadInstructions(),
    })
}

async function onSave() {
    props.onUpdated?.(instructionContent.value)
    props.onClose()
}

async function onReset() {
    state.instructionId = 0
    state.customInstruction = 'You are a helpful AI assistant with access to various tools. Use the tools available to help the user accomplish their tasks effectively.'
}
</script>

<template>
    <UModal prevent-close>
        <UForm :state="state" @submit="onSave">
            <UCard>
                <template #header>
                    <div class="flex items-center">
                        <span class="mr-auto">{{ t("agents.settings") || "Agent Settings" }}</span>
                        <UButton icon="i-material-symbols-close-rounded" color="gray" @click="onClose()"></UButton>
                    </div>
                </template>

                <div class="space-y-4">
                    <!-- Instruction Selection -->
                    <UFormGroup :label="t('instructions.instruction')" name="instructionId" class="mb-4">
                        <div class="flex gap-2">
                            <USelectMenu v-model="state.instructionId"
                                         :options="[{ id: 0, name: 'Custom Instruction' }, ...instructions]"
                                         option-attribute="name"
                                         value-attribute="id"
                                         :placeholder="t('chat.selectInstruction')"
                                         class="flex-1"
                                         :loading="loading">
                                <template #leading>
                                    <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                                </template>
                            </USelectMenu>
                            <UTooltip :text="t('instructions.createInstruction')">
                                <UButton icon="i-material-symbols-add"
                                         color="primary"
                                         variant="outline"
                                         @click="onCreateInstruction" />
                            </UTooltip>
                        </div>
                    </UFormGroup>

                    <!-- Custom Instruction Input -->
                    <UFormGroup :label="state.instructionId === 0 ? 'Custom Instruction' : 'Preview'" name="customInstruction" class="mb-4">
                        <UTextarea v-model="state.customInstruction"
                                   :rows="6"
                                   :readonly="state.instructionId !== 0"
                                   :placeholder="t('instructions.instructionPlaceholder') || 'Enter your custom instruction...'"
                                   class="w-full" />
                        <div v-if="state.instructionId !== 0" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            This instruction is from the selected preset. Choose "Custom Instruction" to edit.
                        </div>
                    </UFormGroup>
                </div>

                <template #footer>
                    <div class="flex justify-between">
                        <UButton color="gray" variant="outline" @click="onReset">
                            {{ t("chat.resetToDefault") || "Reset to Default" }}
                        </UButton>
                        <div class="flex gap-2">
                            <UButton color="gray" @click="onClose()">{{ t("global.cancel") }}</UButton>
                            <UButton type="submit" color="primary">{{ t("global.save") }}</UButton>
                        </div>
                    </div>
                </template>
            </UCard>
        </UForm>
    </UModal>
</template>
