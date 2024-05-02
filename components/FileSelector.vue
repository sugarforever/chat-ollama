<script lang="ts" setup>
withDefaults(
  defineProps<{
    accept?: string
    disabled?: boolean
    color?: string
  }>(),
  {
    accept: ".txt,.json,.md,.doc,.docx,.pdf,.csv",
    color: "gray",
  }
)

const { t } = useI18n()
const files = defineModel<File[]>({ default: () => [] })

function onRemove(file: File) {
  files.value = files.value.filter((f) => f !== file)
}
</script>

<template>
  <div class="flex items-center">
    <FileButton v-model="files" :disabled :color multiple :accept>{{ t("global.selectFiles") }}</FileButton>
    <FileButton v-model="files" :disabled :color directory :accept class="mx-2">{{ t("global.selectFolder") }}</FileButton>
    <span class="text-sm text-muted" v-show="files.length > 0">{{ t("knowledgeBases.files", [files.length]) }}</span>
  </div>
  <ul class="my-2 text-sm text-primary-400/80 max-h-40 overflow-auto">
    <li
        v-for="(file, i) in files"
        :key="file.lastModified"
        :class="{ 'border-t': i > 0 }"
        class="file-item rounded flex items-center transition hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-100 dark:border-gray-700">
      <span class="mr-auto py-2">{{ file.name }}</span>
      <UButton
               color="red"
               icon="i-heroicons-trash-20-solid"
               variant="ghost"
               size="xs"
               class="hidden"
               @click="onRemove(file)"></UButton>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.file-item {
  padding: 0 0.5rem;

  &:hover button {
    display: block;
  }
}
</style>
