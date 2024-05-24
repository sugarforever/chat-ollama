<script lang="ts" setup>
import type { ModelInfo } from '~/composables/useModels'

const props = withDefaults(defineProps<{
  autoDefault?: boolean,
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  autoDefault: true,
})

type ModelName = string
type ModelFamilyName = string

const { t } = useI18n()

const value = defineModel<[ModelName, ModelFamilyName]>({ default: [] })
const currentModel = defineModel<ModelInfo>('modelInfo')

const { loadModels, chatModels } = useModels({ immediate: false })

const selectValue = computed({
  get() {
    return getModelItem()
  },
  set(val) {
    value.value = [val!.value, val!.family || '']
  }
})

await loadModels()

watch(value, () => {
  currentModel.value = getModelItem()
}, { immediate: true })

onMounted(() => {
  if (props.autoDefault && [...value.value].length === 0 && chatModels.value.length > 0) {
    value.value = [chatModels.value[0].value, chatModels.value[0].family || '']
  }
})

function getModelItem() {
  return chatModels.value.find(el => {
    return el.value === value.value?.[0] && (value.value[1] === '' || value.value[1] === el.family)
  })
}
</script>

<template>
  <ClientOnly>
    <USelectMenu v-model="selectValue"
                 :options="chatModels"
                 :size
                 :placeholder="t('global.selectModel')">
      <template #label>
        <span>{{ currentModel?.family }}</span>
        <span class="text-muted">/</span>
        <span>{{ currentModel?.label }}</span>
      </template>
      <template #option="{ option }">
        <span>{{ option.family }}</span>
        <span class="text-muted">/</span>
        <span>{{ option.label }}</span>
      </template>
    </USelectMenu>
  </ClientOnly>
</template>
