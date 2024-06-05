<script lang="ts" setup>
import { loadOllamaInstructions, loadKnowledgeBases } from '~/utils/settings'
import type { Instruction, KnowledgeBase } from '@prisma/client'

interface UpdatedOptions {
  title: string
  attachedMessagesCount: number
  knowledgeBaseInfo?: KnowledgeBase
  instructionInfo?: Instruction
}

const props = defineProps<{
  sessionId: number
  onClose: () => void
  onUpdated?: (data: UpdatedOptions) => void
  onClear?: () => void
}>()

const { t } = useI18n()
const confirm = useDialog('confirm')

const defaultConfig = {
  instructionId: 0,
  knowledgeBaseId: 0,
  attachedMessagesCount: chatDefaultSettings.value.attachedMessagesCount,
} as const

const state = reactive({
  title: '',
  ...defaultConfig,
})

const instructions = await loadOllamaInstructions()
const knowledgeBases = await loadKnowledgeBases()

const instructionContent = computed(() => {
  return instructions.find(el => el.id === state.instructionId)?.instruction || ''
})

onMounted(() => {
  clientDB.chatSessions
    .get(props.sessionId)
    .then(res => {
      if (!res) return
      Object.assign(state, pick(res, Object.keys(state) as (keyof typeof state)[]))
    })
})

function onClearHistory() {
  props.onClose()
  setTimeout(() => {
    confirm(t('chat.clearConfirmTip')).then(async () => {
      await clientDB.chatHistories.where('sessionId').equals(props.sessionId).delete()
      props.onClear?.()
    }).catch(noop)
  }, 50)
}

async function onSave() {
  const knowledgeBaseInfo = knowledgeBases.find(el => el.id === state.knowledgeBaseId)
  const instructionInfo = instructions.find(el => el.id === state.instructionId)

  await clientDB.chatSessions
    .where('id')
    .equals(props.sessionId)
    .modify({ ...state })

  props.onUpdated?.({
    title: state.title,
    attachedMessagesCount: state.attachedMessagesCount,
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
            <span class="mr-auto">{{ t("chat.chatSettingsTitle") }}</span>
            <UButton icon="i-material-symbols-close-rounded" color="gray" @click="onClose()"></UButton>
          </div>
        </template>
        <UFormGroup :label="t('chat.topic')" name="title" class="mb-4">
          <UInput v-model="state.title" maxlength="40" />
        </UFormGroup>
        <UFormGroup :label="t('chat.knowledgeBase')" name="knowledgeBaseId" class="mb-4">
          <USelectMenu v-model="state.knowledgeBaseId"
                       :options="knowledgeBases"
                       value-attribute="id"
                       option-attribute="name"
                       :placeholder="t('chat.selectKB')"></USelectMenu>
        </UFormGroup>
        <UFormGroup :label="t('instructions.instruction')" name="instructionId" class="mb-4">
          <USelectMenu v-model="state.instructionId"
                       :options="instructions"
                       option-attribute="name"
                       value-attribute="id"
                       :placeholder="t('chat.selectInstruction')"></USelectMenu>
          <div class="my-1 text-sm text-muted">{{ instructionContent }}</div>
        </UFormGroup>
        <UFormGroup :label="t('chat.attachedMessagesCount')" name="instructionId">
          <div class="flex items-center">
            <span class="mr-2 w-6 text-primary-500">{{ state.attachedMessagesCount }}</span>
            <URange v-model="state.attachedMessagesCount" :min="0" :max="$config.public.chatMaxAttachedMessages" size="md" />
          </div>
        </UFormGroup>
        <div class="text-center mt-6">
          <UButton icon="i-material-symbols-delete-history" color="red" @click="onClearHistory">{{ t('chat.clearBtn') }}</UButton>
        </div>
        <template #footer>
          <div class="text-right">
            <UButton color="gray" class="mr-2" @click="onReset">{{ t("chat.resetToDefault") }}</UButton>
            <UButton type="submit">{{ t("global.save") }}</UButton>
          </div>
        </template>
      </UCard>
    </UForm>
  </UModal>
</template>
