<script lang="ts" setup>
import { type ModelInfo } from '~/utils/settings'

const props = withDefaults(defineProps<{
  autoDefault?: boolean,
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  autoDefault: true,
})

const value = defineModel<string>()
const currentModel = defineModel<ModelInfo>('modelInfo')

const models = await loadModels()

watch(value, () => {
  currentModel.value = models.find(el => el.value === value.value)
}, { immediate: true })

onMounted(() => {
  if (props.autoDefault && !value.value && models.length > 0) {
    value.value = models[0].value
  }
})
</script>

<template>
  <ClientOnly>
    <USelectMenu v-model="value"
                 :options="models"
                 value-attribute="value"
                 :size
                 placeholder="Select a model">
      <template #label>
        <span>{{ currentModel?.family }}</span>
        <span class="text-muted">/</span>
        <span>{{ value }}</span>
      </template>
      <template #option="{ option }">
        <span>{{ option.family }}</span>
        <span class="text-muted">/</span>
        <span>{{ option.label }}</span>
      </template>
    </USelectMenu>
  </ClientOnly>
</template>
