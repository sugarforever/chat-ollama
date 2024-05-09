<script lang="ts" setup>
const menus = useMenus()
</script>

<template>
  <div class="w-full box-border">
    <ul class="p-4">
      <li v-for="menu in menus" :key="menu.to" class="my-1">
        <RouterLink :to="menu.to"
                    active-class="!text-primary-400"
                    class="block px-2 py-1 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100">
          <Icon :name="menu.icon" />
          <span class="ml-2">{{ menu.label }}</span>
        </RouterLink>
      </li>
    </ul>
    <div class="flex items-center p-4 border-t border-gray-200 dark:border-gray-700">
      <div class="mr-4">
        <ColorMode />
      </div>
      <ULink to="https://github.com/sugarforever/chat-ollama"
             target="_blank"
             class="i-mdi-github text-2xl ml-2 mr-4"></ULink>
      <Auth class="ml-auto" />
    </div>
  </div>
</template>
