<script lang="ts" setup>
import { loadKnowledgeBases } from '~/utils/settings'
import type { Instruction, KnowledgeBase } from '@prisma/client'

const features = useFeatures()
const isKnowledgeBaseEnabled = computed(() => features.knowledgeBaseEnabled)
const isMcpEnabled = computed(() => features.mcpEnabled)

interface UpdatedOptions {
  title: string
  attachedMessagesCount: number
  knowledgeBaseInfo?: KnowledgeBase
  instructionInfo?: Instruction
  enableToolUsage?: boolean
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
  enableToolUsage: chatDefaultSettings.value.enableToolUsage,
} as const

const state = reactive({
  title: '',
  ...defaultConfig,
})

const { getInstructions, isLoading: isInstructionsLoading } = useInstructionsCache()
const instructions = await getInstructions()
const knowledgeBases = isKnowledgeBaseEnabled.value ? await loadKnowledgeBases() : []

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
  const knowledgeBaseInfo = isKnowledgeBaseEnabled.value
    ? knowledgeBases.find(el => el.id === state.knowledgeBaseId)
    : undefined
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
    enableToolUsage: state.enableToolUsage,
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
      <div class="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md mx-auto overflow-hidden">
        <!-- Header -->
        <div class="relative px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t("chat.chatSettingsTitle") }}</h3>
          <button
                  @click="onClose()"
                  class="absolute top-3 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200">
            <UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 py-5 space-y-4">
          <!-- Chat Title -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('chat.topic') }}</label>
            <UInput
                    v-model="state.title"
                    maxlength="40"
                    class="w-full"
                    :ui="{ base: 'relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none border-0 form-input rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-sm px-3.5 py-2.5 shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400' }" />
          </div>

          <!-- Knowledge Base -->
          <div v-if="isKnowledgeBaseEnabled" class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <UIcon name="i-heroicons-book-open" class="w-4 h-4 mr-2 text-primary-500" />
              {{ t('chat.knowledgeBase') }}
            </label>
            <USelectMenu
                         v-model="state.knowledgeBaseId"
                         :options="knowledgeBases"
                         value-attribute="id"
                         option-attribute="name"
                         :placeholder="t('chat.selectKB')"
                         :ui="{
                          base: 'relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none border-0 form-select rounded-lg text-sm px-3.5 py-2.5 shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400',
                          option: { base: 'cursor-default select-none relative py-2 pl-3 pr-9' }
                        }" />
          </div>

          <!-- Instructions -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <UIcon name="i-heroicons-command-line" class="w-4 h-4 mr-2 text-primary-500" />
              {{ t('instructions.instruction') }}
            </label>
            <USelectMenu
                         v-model="state.instructionId"
                         :options="instructions"
                         option-attribute="name"
                         value-attribute="id"
                         :placeholder="t('chat.selectInstruction')"
                         :ui="{
                          base: 'relative block w-full disabled:cursor-not-allowed disabled:opacity-75 focus:outline-none border-0 form-select rounded-lg text-sm px-3.5 py-2.5 shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400',
                          option: { base: 'cursor-default select-none relative py-2 pl-3 pr-9' }
                        }" />
            <p v-if="instructionContent" class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{{ instructionContent }}</p>
          </div>

          <!-- Message History -->
          <div class="space-y-2">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <UIcon name="i-heroicons-clock" class="w-4 h-4 mr-2 text-primary-500" />
                  {{ t('chat.attachedMessagesCount') }}
                </label>
                <span class="text-base font-semibold text-primary-600 dark:text-primary-400">{{ state.attachedMessagesCount }}</span>
              </div>
              <URange
                      v-model="state.attachedMessagesCount"
                      :min="0"
                      :max="$config.public.chatMaxAttachedMessages"
                      size="md"
                      :ui="{
                        track: { background: 'bg-gray-200 dark:bg-gray-700' },
                        thumb: { background: 'bg-primary-500 dark:bg-primary-400' },
                        progress: { background: 'bg-primary-500 dark:bg-primary-400' }
                      }" />
              <div class="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>0</span>
                <span>{{ $config.public.chatMaxAttachedMessages }}</span>
              </div>
            </div>
          </div>

          <!-- Tool Usage -->
          <div v-if="isMcpEnabled" class="space-y-2">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <label class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <UIcon name="i-heroicons-wrench-screwdriver" class="w-4 h-4 mr-2 text-primary-500" />
                    {{ t('settings.enableToolUsage') }}
                  </label>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ t('settings.enableToolUsageHelp') }}</p>
                </div>
                <UToggle
                         v-model="state.enableToolUsage"
                         size="md"
                         :ui="{
                          active: 'bg-primary-500 dark:bg-primary-400',
                          inactive: 'bg-gray-200 dark:bg-gray-700'
                        }" />
              </div>
            </div>
          </div>

          <!-- Clear History -->
          <div class="pt-1 border-t border-gray-100 dark:border-gray-800">
            <button
                    @click="onClearHistory"
                    class="flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors duration-200">
              <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-2" />
              {{ t('chat.clearBtn') }}
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3">
          <button
                  type="button"
                  @click="onReset"
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
            {{ t("chat.resetToDefault") }}
          </button>
          <button
                  type="submit"
                  class="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 rounded-lg transition-colors duration-200 shadow-sm">
            {{ t("global.save") }}
          </button>
        </div>
      </div>
    </UForm>
  </UModal>
</template>
