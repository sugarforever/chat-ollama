<script setup>
import { ref } from 'vue';
import { loadOllamaHost, loadOllamaUserName, loadOllamaPassword } from '@/utils/settings'

defineProps({
  placeholder: String
})
const currentModel = defineModel()

const models = ref([]);

const loadModels = async () => {
  const response = await $fetch('/api/models/', {
    headers: {
      'x_ollama_host': loadOllamaHost() || '',
      'x_ollama_username': loadOllamaUserName() || '',
      'x_ollama_password': loadOllamaPassword() || '',
      'x_openai_api_key': loadKey(OPENAI_API_KEY) || '',
      'x_anthropic_api_key': loadKey(ANTHROPIC_API_KEY) || ''
    }
  });

  models.value = response.models.map(el => {
    return { label: `${el.name}`, value: el.name }
  })

  if (models.value.length === 0) return

  if (
    (currentModel.value && !models.value.some(el => el.name === currentModel.value)) // 已设置当前模型但不存在
    ||
    !currentModel.value // 未设置当前模型
  ) {
    currentModel.value = models.value[0].value
  }
};

loadModels()
</script>

<template>
  <ClientOnly>
    <USelect v-model="currentModel" :options="models" :placeholder="placeholder" />
  </ClientOnly>
</template>
