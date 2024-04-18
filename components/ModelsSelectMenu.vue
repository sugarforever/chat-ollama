<script lang="ts" setup>
import { type ModelInfo } from '~/utils/settings'

const props = withDefaults(defineProps<{
  autoDefault?: boolean,
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  autoDefault: true,
})

type ModelName = string
type ModelFamilyName = string

const value = defineModel<[ModelName, ModelFamilyName]>({ default: [] })
const currentModel = defineModel<ModelInfo>('modelInfo')

const selectValue = computed({
  get() {
    return getModelItem()
  },
  set(val) {
    value.value = [val!.value, val!.family || '']
  }
})

const models = await loadModels()

watch(value, () => {
  currentModel.value = getModelItem()
}, { immediate: true })

onMounted(() => {
  if (props.autoDefault && [...value.value].length === 0 && models.length > 0) {
    value.value = [models[0].value, models[0].family || '']
  }
})

function getModelItem() {
  return models.find(el => {
    return el.value === value.value?.[0] && (value.value[1] === '' || value.value[1] === el.family)
  })
}
</script>

<template>
  <ClientOnly>
    <USelectMenu v-model="selectValue"
                 :options="models"
                 :size
                 placeholder="Select a model">
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
