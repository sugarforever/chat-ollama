<script lang="ts" setup>
interface Props {
  images: string[]
}

defineProps<Props>()
</script>

<template>
  <div v-if="images.length > 0" class="my-3 grid gap-2 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
    <img 
      v-for="(url, index) in images"
      :key="index"
      :src="url"
      class="w-full h-auto rounded-lg max-h-64 object-contain bg-gray-100 dark:bg-gray-800 hover:cursor-pointer hover:opacity-90 transition-opacity"
      :alt="`Image ${index + 1}`" 
    />
  </div>
</template>