<script setup lang="ts">
import { ref } from 'vue'
import { fetchHeadersOllama, fetchHeadersThirdApi } from '@/utils/settings'

defineProps({
  placeholder: String
})

const emits = defineEmits<{
  change: [modeName: string]
}>()

const currentModel = defineModel<string>({ required: true })
const familyMode = defineModel<string>('family', { default: '' })

const models = ref<{ label: string, value: string, family?: string }[]>([])

watch(currentModel, (val) => {
  if (!val && models.value.length > 0) {
    currentModel.value = models.value[0].value
    emits('change', models.value[0].value)
  }
})

const loadModels = async () => {
  const response = await $fetch('/api/models/', {
    headers: {
      ...fetchHeadersOllama.value,
      ...fetchHeadersThirdApi.value,
    }
  })

  models.value = response
    // filter out nomic-bert family models，as they as embedding models do not support chat apparently.
    .filter(el => el?.details?.family !== 'nomic-bert')
    .map(el => {
      return {
        label: `${el?.details?.family === "Azure OpenAI" ? `Azure ${el.name}` : el.name}`,
        value: el.name!,
        family: el?.details?.family,
      }
    })

  if (models.value.length === 0) return

  if (
    (currentModel.value && !models.value.some(el => el.value === currentModel.value)) // 已设置当前模型但不存在
    ||
    !currentModel.value // 未设置当前模型
  ) {
    currentModel.value = models.value[0].value
  }
}

loadModels()

function onChange() {
  const model = models.value.find(el => el.value === currentModel.value)
  if (model) {
    familyMode.value = model?.family || ''
    emits('change', model.value)
  }
}
</script>

<template>
  <ClientOnly>
    <USelect v-model="currentModel"
             :options="models"
             :placeholder="placeholder"
             @change="onChange" />
  </ClientOnly>
</template>
