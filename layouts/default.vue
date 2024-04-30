<script setup>
import {useI18n} from "vue-i18n";
const { t } = useI18n()
const links = [
  [
    { label: t('Home'), icon: 'i-heroicons-home', to: '/' },
    { label: t('Models'), icon: 'i-heroicons-rectangle-stack', to: '/models' },
    { label: t('Instructions'), icon: 'i-iconoir-terminal', to: '/instructions' },
    { label: t('Knowledge Bases'), icon: 'i-heroicons-book-open', to: '/knowledgebases' },
    { label: t('Chat'), icon: 'i-iconoir-chat-lines', to: '/chat' },
    { label: t('Settings'), icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
  ],
]
</script>
<template>
  <div class="border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between max-w-6xl mx-auto px-4">
      <h1 class="flex flex-row items-center mr-2">
        <TheLogo class="w-[32px] h-[32px] mr-2" />
        <span class="text-primary font-semibold text-lg">ChatOllama</span>
      </h1>
      <div>
        <ClientOnly>
          <UHorizontalNavigation :links="links" />
        </ClientOnly>
      </div>
      <div class="flex items-center">
        <div class="mx-2">
          <ColorMode />
        </div>
        <ULink to="https://github.com/sugarforever/chat-ollama"
               target="_blank"
               class="i-mdi-github text-2xl ml-2 mr-4"></ULink>
        <Auth />
      </div>
    </div>
  </div>

  <div id="main" class="p-4 box-border overflow-auto" style="height: calc(100% - 61px)">
    <slot />
  </div>
  <UNotifications />
</template>
