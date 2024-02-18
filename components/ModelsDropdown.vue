<script setup>
import { ref, onMounted } from 'vue';
import { loadOllamaHost } from '@/utils/settings'

const emit = defineEmits(["modelSelected"])

const models = ref([]);
const selectedModel = ref(null);
const label = computed(() => selectedModel.value ? selectedModel.value : "Models");

const loadModels = async () => {
  const response = await $fetch('/api/models/', {
    headers: {
      'x_ollama_host': loadOllamaHost()
    }
  });
  return response.models;
};

onMounted(async () => {
  const responseModels = await loadModels();
  models.value = [
    responseModels.map(m => {
      return {
        label: m.name,
        click: () => {
          selectedModel.value = m.name;
          emit("modelSelected", m.name);
        }
      }
    })
  ];
})

</script>
<template>
  <ClientOnly>
    <UDropdown :items="models" :popper="{ placement: 'bottom-start' }">
      <UButton color="white" :label="label" trailing-icon="i-heroicons-chevron-down-20-solid" />
    </UDropdown>
  </ClientOnly>
</template>
