<script setup lang="ts">
import { type ProgressResponse } from 'ollama'

const emit = defineEmits(["modelDownloaded"])

const { t } = useI18n()
const toast = useToast()
const state = reactive({
  modelName: undefined
})
const downloading = ref(false)
const progresses = ref<ProgressResponse[]>([])

const fetchStream = async (url: string, options: RequestInit) => {
  const response = await fetchWithAuth(url, options)

  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = new TextDecoder().decode(value)
      chunk.split("\n\n").forEach((line) => {
        if (line) {
          const progress = JSON.parse(line)

          if (progress.error) {
            throw new Error(progress.error)
          }

          const existing = progresses.value.find((p) => p.status === progress.status)
          if (existing) {
            Object.assign(existing, progress)
          } else {
            progresses.value.push(progress)
          }
        }
      })
    }
  } else {
    console.log(t("global.streamError"))
  }
}

const onDownload = async () => {
  downloading.value = true
  progresses.value = []
  const { modelName } = state

  try {
    await fetchStream('/api/models/pull', {
      method: 'POST',
      body: JSON.stringify({
        model: modelName,
        stream: true,
      }),
      headers: {
        ...getKeysHeader(),
        'Content-Type': 'application/json',
      },
    })
    emit("modelDownloaded", modelName)
  } catch (error: any) {
    progresses.value = []
    toast.add({ color: 'red', title: t("models.downloadFailed"), description: error.message })
  }

  downloading.value = false
}
</script>

<template>
  <UForm :state="state" @submit="onDownload">
    <div class="flex flex-col md:flex-row items-center">
      <div class="flex grow w-full gap-2 md:max-w-lg">
        <UInput class="flex-1" size="lg" v-model="state.modelName" :placeholder="t('models.modelNameInputPlaceholder')"
                required />
        <UButton type="submit" :loading="downloading">
          {{ t("global.download") }}
        </UButton>
      </div>
      <div class="text-sm text-gray-500 mt-4 md:mt-0 mx-2 shrink-0" v-html="t('models.discover')"></div>
    </div>
    <ul class="flex flex-col gap-2 mt-4 px-3.5 py-2.5 bg-gray-100" v-if="progresses.length > 0">
      <li v-for="(progress, index) in progresses" :key="index">
        <UProgress :value="progress.completed / progress.total * 100" indicator v-if="progress.completed > 0">
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
