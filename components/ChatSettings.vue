<script lang="ts" setup>
import { loadOllamaInstructions, loadKnowledgeBases, type ModelInfo } from '~/utils/settings'
import type { Instruction, KnowledgeBase } from '@prisma/client'
import {useI18n} from "vue-i18n";
const { t } = useI18n()

interface UpdatedOptions {
  title: string
  attachedMessagesCount: number
  modelInfo: { label: string, value: string, family?: string }
  knowledgeBaseInfo?: KnowledgeBase
  instructionInfo?: Instruction
}

const props = defineProps<{
  sessionId: number
  onClose: () => void
  onUpdated?: (data: UpdatedOptions) => void
}>()

const defaultConfig = {
  instructionId: 0,
  knowledgeBaseId: 0,
  attachedMessagesCount: chatDefaultSettings.value.attachedMessagesCount,
}

const state = reactive({
  title: '',
  model: [] as unknown as [string, string],
  ...defaultConfig,
})
const currentModel = ref<ModelInfo>()

const instructions = await loadOllamaInstructions()
const knowledgeBases = await loadKnowledgeBases()

const instructionContent = computed(() => {
  return instructions.find(el => el.id === state.instructionId)?.instruction || ''
})

onMounted(() => {
  clientDB.chatSessions
    .get(props.sessionId)
    .then(res => {
      Object.assign(state, res, { model: [res?.model, res?.modelFamily] })
    })
})

async function onSave() {
  const knowledgeBaseInfo = knowledgeBases.find(el => el.id === state.knowledgeBaseId)
  const instructionInfo = instructions.find(el => el.id === state.instructionId)

  await clientDB.chatSessions
    .where('id')
    .equals(props.sessionId)
    .modify({
      ...state,
      model: state.model[0],
      modelFamily: currentModel.value?.family,
    })

  props.onUpdated?.({
    title: state.title,
    attachedMessagesCount: state.attachedMessagesCount,
    modelInfo: currentModel.value!,
    knowledgeBaseInfo: knowledgeBaseInfo as KnowledgeBase,
    instructionInfo,
  })
  props.onClose()
}

async function onReset() {
  Object.assign(state, defaultConfig)
}
</script>

<template>
  <UModal prevent-close>
    <UForm :state="state" @submit="onSave">
      <UCard>
        <template #header>
          <div class="flex items-center">
            <span class="mr-auto">{{ t("chat.Current Chat Settings") }}</span>
            <UButton icon="i-material-symbols-close-rounded" color="gray" @click="onClose()"></UButton>
          </div>
        </template>
        <UFormGroup :label="t('chat.topic')" name="title" class="mb-4">
          <UInput v-model="state.title" maxlength="40" />
        </UFormGroup>
        <UFormGroup :label="t('chat.model')" name="model" required class="mb-4">
          <ModelsSelectMenu v-model="state.model" v-model:modelInfo="currentModel" />
        </UFormGroup>
        <UFormGroup :label="t('chat.knowledgeBase')" name="knowledgeBaseId" class="mb-4">
          <USelectMenu v-model="state.knowledgeBaseId"
                       :options="knowledgeBases"
                       value-attribute="id"
                       option-attribute="name"
                       :placeholder="t('chat.Select a knowledge base')"></USelectMenu>
        </UFormGroup>
        <UFormGroup :label="t('instructions.instruction')" name="instructionId" class="mb-4">
          <USelectMenu v-model="state.instructionId"
                       :options="instructions"
                       option-attribute="name"
                       value-attribute="id"
                       :placeholder="t('chat.selectInstruction')"></USelectMenu>
          <div class="my-1 text-sm text-muted">{{ instructionContent }}</div>
        </UFormGroup>
        <UFormGroup :label="t('chat.Attached Messages Count')" name="instructionId">
          <div class="flex items-center">
            <span class="mr-2 w-6 text-primary-500">{{ state.attachedMessagesCount }}</span>
            <URange v-model="state.attachedMessagesCount" :min="0" :max="$config.public.chatMaxAttachedMessages" size="md" />
          </div>
        </UFormGroup>
        <template #footer>
          <div class="text-right">
            <UButton color="gray" class="mr-2" @click="onReset">{{ t("chat.Reset to Default") }}</UButton>
            <UButton type="submit">{{ t("global.save") }}</UButton>
          </div>
        </template>
      </UCard>
    </UForm>
  </UModal>
</template>
