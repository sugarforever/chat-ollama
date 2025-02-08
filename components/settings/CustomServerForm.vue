<script lang="ts" setup>
import { object, string, array } from 'yup'
import type { ContextKeys } from '~/server/middleware/keys'
import * as CONFIG_MODELS from '~/config/models'

const props = defineProps<{
  value: ContextKeys['custom'][number]
}>()

const emits = defineEmits<{
  update: [ContextKeys['custom'][number]]
  remove: []
}>()

const toast = useToast()
const confirm = useDialog('confirm')
const { t } = useI18n()
const aiTypes = Object.entries(CONFIG_MODELS.MODEL_FAMILIES).filter(([key]) => key !== 'moonshot').map(([value, label]) => ({ value, label }))
const defaultModelsMap: Record<ContextKeys['custom'][number]['aiType'], string[]> = {
  openai: CONFIG_MODELS.OPENAI_GPT_MODELS,
  azureOpenai: CONFIG_MODELS.AZURE_OPENAI_GPT_MODELS,
  anthropic: CONFIG_MODELS.ANTHROPIC_MODELS,
  gemini: CONFIG_MODELS.GEMINI_MODELS,
  groq: CONFIG_MODELS.GROQ_MODELS,
}

const defaultState: ContextKeys['custom'][number] = { name: '', aiType: 'openai', endpoint: '', key: '', proxy: false, models: [] }
const defaultAiType = props.value.aiType || aiTypes[0].value
const state = reactive(Object.assign({}, defaultState, props.value, {
  aiType: defaultAiType
}))
const modelName = ref('')
const schema = computed(() => {
  return object({
    name: string().required(t('global.required')),
    aiType: string().required(t('global.required')),
    endpoint: string().url(t('global.invalidUrl')).required(t('global.required')),
    key: string().required(t('global.required')),
    modelsEndpoint: string(),
    proxy: string().optional(),
  })
})

watch(() => state.aiType, (type) => {
  if (type !== 'openai') {
    state.models = defaultModelsMap[type] || []
  }
})

function onSubmit() {
  emits('update', { ...state })
}

function onAddModel() {
  const name = modelName.value.trim()
  if (state.models.includes(name)) {
    toast.add({ title: t('settings.modelNameExist'), color: 'red' })
    return
  }

  state.models.unshift(name)
  modelName.value = ''
}

function onRemove() {
  confirm(t('settings.ensureRemoveCustomService')).then(() => emits('remove'))
}
</script>

<template>
  <UForm :state="state" :schema="schema" @submit="onSubmit">
    <UFormGroup :label="t('settings.aiType')" class="mb-4" name="aiType">
      <USelectMenu v-model="state.aiType"
                   :options="aiTypes"
                   size="lg"
                   value-attribute="value"
                   option-attribute="label" />
    </UFormGroup>
    <UFormGroup :label="t('settings.baseURL')" class="mb-4" name="endpoint">
      <UInput v-model.trim="state.endpoint" size="lg" :placeholder="t('global.required')" />
    </UFormGroup>
    <UFormGroup :label="t('settings.modelsEndpoint')" class="mb-4" name="modelsEndpoint">
      <UInput v-model.trim="state.modelsEndpoint" size="lg" :placeholder="t('global.optional') + ' (/models)'" />
    </UFormGroup>
    <UFormGroup :label="t('settings.apiKey')" class="mb-4" name="key">
      <UInput v-model.trim="state.key" size="lg" type="password" :placeholder="t('global.required')" />
    </UFormGroup>
    <div class="my-4">
      <label>
        <input type="checkbox" v-model="state.proxy" />
        <span class="ml-2 text-sm text-muted">({{ t('settings.proxyTips') }})</span>
      </label>
    </div>
    <div class="flex justify-between">
      <UButton type="submit">
        {{ t("global.save") }}
      </UButton>
      <UButton color="red" class="ml-2" @click="onRemove">
        {{ t('settings.removeCustomService') }}
      </UButton>
    </div>
  </UForm>
</template>

<style lang="scss" scoped>
.model-name-item {
  &:hover {
    button {
      display: block;
    }
  }
}
</style>
