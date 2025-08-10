<script lang="ts" setup>
const menus = useMenus()
</script>

<template>
  <div class="w-full h-full flex flex-col">
    <!-- Navigation Menu -->
    <nav class="flex-1 p-4 space-y-2">
      <NuxtLink v-for="link in menus" :key="link.to" :to="link.to"
                class="flex items-center p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                active-class="!bg-primary-50 dark:!bg-primary-900/20 !text-primary-600 dark:!text-primary-400">
        <Icon :name="link.icon" class="w-5 h-5 flex-shrink-0" />
        <span class="ml-3 truncate">{{ link.label }}</span>
      </NuxtLink>
    </nav>

    <!-- Bottom Section -->
    <div class="flex flex-row p-4 border-t border-gray-200 dark:border-gray-700">
      <!-- Color Mode Toggle -->
      <div class="flex items-center">
        <ColorMode />
      </div>

      <!-- GitHub Link -->
      <div class="flex items-center">
        <UButton color="gray"
                 variant="ghost"
                 icon="i-mdi-github"
                 aria-label="GitHub"
                 :to="'https://github.com/sugarforever/chat-ollama'"
                 target="_blank"
                 :external="true" />
      </div>

      <!-- Auth Component -->
      <div class="flex items-center">
        <Auth />
      </div>
    </div>
  </div>
</template>
