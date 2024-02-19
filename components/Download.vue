<script setup>
import { loadOllamaHost } from '@/utils/settings'

const emit = defineEmits(["modelDownloaded"])

const state = reactive({
  modelName: undefined
});
const downloading = ref(false);
const progresses = ref([]);

const fetchStream = async (url, options) => {
  const response = await fetch(url, options);

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      chunk.split("\n\n").forEach((line) => {
        if (line) {
          const progress = JSON.parse(line);

          const { total, completed = 0 } = progress;
          if (total && completed) {
            progress.percentage = `${parseInt((completed / total) * 100)}%`;
          }

          const existing = progresses.value.find((p) => p.status === progress.status);
          if (existing) {
            Object.assign(existing, progress);
          } else {
            progresses.value.push(progress);
          }
        }
      });
    }
  } else {
    console.log("The browser doesn't support streaming responses.");
  }
}

const onDownload = async () => {
  downloading.value = true;
  progresses.value = [];
  const { modelName } = state;
  await fetchStream('/api/models/pull', {
    method: 'POST',
    body: JSON.stringify({
      model: modelName,
      stream: true,
    }),
    headers: {
      'x_ollama_host': loadOllamaHost(),
      'x_ollama_username': loadOllamaUserName(),
      'x_ollama_password': loadOllamaPassword(),
      'Content-Type': 'application/json',
    },
  });
  emit("modelDownloaded", modelName);
  downloading.value = false;
};
</script>

<template>
  <UForm :state="state" @submit="onDownload">
    <div class="flex flex-row w-full gap-2">
      <UInput class="flex-1" size="lg" v-model="state.modelName" placeholder="Enter the model name to download" />
      <UButton type="submit" :loading="downloading">
        Download
      </UButton>
    </div>
    <ul class="flex flex-col gap-2 mt-4 px-3.5 py-2.5 bg-gray-100" v-if="progresses.length > 0">
      <li v-for="(progress, index) in progresses" :key="index">
        <UProgress :value="parseInt(progress.percentage)" indicator v-if="progress.percentage">
          <template #indicator="{ percent }">
            <div class="font-light text-xs text-gray-700">
              <span>{{ progress.status }}</span>
              <span class="float-right">{{ `${parseInt(percent)}%` }}</span>
            </div>
          </template>
        </UProgress>
        <span class="font-light text-xs text-gray-700" v-else>{{ progress.status }}</span>
      </li>
    </ul>
  </UForm>
</template>
