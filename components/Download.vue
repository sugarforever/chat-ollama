<script setup>

import ollama from 'ollama';

const emit = defineEmits(["modelDownloaded"])

const state = reactive({
  modelName: undefined
});
const downloading = ref(false);
const progresses = ref([]);

const onDownload = async () => {
  downloading.value = true;
  progresses.value = [];
  const { modelName } = state;
  console.log("Downloading model: ", modelName);

  try {
    const response = await ollama.pull({ model: modelName, stream: true });
    for await (const progress of response) {
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
      console.log("Progress: ", progresses.value);
    }

    emit("modelDownloaded", modelName);
  } catch (error) {
    console.error("Error downloading model: ", error);
  }

  downloading.value = false;
}
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
