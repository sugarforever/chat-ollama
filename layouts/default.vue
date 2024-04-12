<script setup>
const links = [
  [
    { label: 'Home', icon: 'i-heroicons-home', to: '/' },
    { label: 'Models', icon: 'i-heroicons-rectangle-stack', to: '/models' },
    { label: 'Instructions', icon: 'i-iconoir-terminal', to: '/instructions' },
    { label: 'Knowledge Bases', icon: 'i-heroicons-book-open', to: '/knowledgebases' },
    { label: 'Chat', icon: 'i-iconoir-chat-lines', to: '/chat' },
    { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
  ],
]
</script>
<template>
  <div class="border-b border-gray-200 dark:border-gray-800">
    <div class="flex items-center justify-between max-w-6xl mx-auto px-4">
      <h1 class="mr-2 font-semibold text-primary text-2xl">ChatOllama</h1>
      <div>
        <UHorizontalNavigation :links="links" />
      </div>
      <div class="flex items-center">
        <div class="mx-2">
          <ColorMode />
        </div>
        <ULink to="https://github.com/sugarforever/chat-ollama"
               target="_blank"
               class="i-mdi-github text-2xl ml-2"></ULink>
      </div>
    </div>
  </div>

  <div id="main" class="p-4 box-border overflow-auto" style="height: calc(100% - 61px)">
    <slot />
  </div>
  <UNotifications />
</template>
