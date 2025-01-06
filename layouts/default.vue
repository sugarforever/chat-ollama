<script lang="ts" setup>
const route = useRoute()
const links = useMenus()

const open = ref(false)
const isMenuOpen = ref(false)
const isChatExpanded = ref(false)
const selectedChat = ref<'charlie' | 'gemini' | null>(null)

watch(() => route.path, () => {
  open.value = false
  isMenuOpen.value = false
  isChatExpanded.value = false
  selectedChat.value = null
})

const openChat = (type: 'charlie' | 'gemini') => {
  selectedChat.value = type
  isMenuOpen.value = false
  isChatExpanded.value = true
}

const handleChatCollapsed = () => {
  isChatExpanded.value = false
  selectedChat.value = null
}
</script>

<template>
  <div class="border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between max-w-6xl mx-auto px-4 box-border h-[var(--top-height)]">
      <h1 class="flex flex-row items-center mr-2">
        <TheLogo class="w-[32px] h-[32px] mr-2" />
        <span class="text-primary font-semibold text-lg">{{ $config.public.appName }}</span>
      </h1>
      <div class="hidden md:block">
        <UHorizontalNavigation :links="[links]">
          <template #default="{ link }">
            <span class="group-hover:text-primary relative hidden lg:inline">{{ link.label }}</span>
          </template>
        </UHorizontalNavigation>
      </div>
      <div class="hidden md:flex items-center">
        <div class="mx-2">
          <ColorMode />
        </div>
        <ULink to="https://github.com/sugarforever/chat-ollama"
               target="_blank"
               class="i-mdi-github text-2xl ml-2 mr-4"></ULink>
        <Auth />
      </div>
      <div class="md:hidden">
        <UPopover v-model:open="open" overlay :ui="{ width: 'w-[100vw] !translate-y-[var(--top-height)]', overlay: { background: '!bg-transparent' } }">
          <UButton icon="i-material-symbols-menu-rounded" color="gray" />
          <template #panel>
            <MobileMenu />
          </template>
        </UPopover>
      </div>
    </div>
  </div>
  <div id="main" class="p-2 md:p-4 box-border overflow-auto" style="height: calc(100% - var(--top-height) - 1px)">
    <slot />
  </div>
  <div class="fixed top-1/2 right-0 -translate-y-1/2 z-40">
    <!-- Mic button and compact menu -->
    <div v-if="!isChatExpanded" class="relative">
      <button @click="isMenuOpen = !isMenuOpen"
              class="flex items-center justify-center bg-white dark:bg-gray-800 rounded-l-full border border-gray-300 dark:border-gray-600 shadow-sm p-3 hover:shadow-md transition-all">
        <div class="i-heroicons-microphone-20-solid w-5 h-5 text-gray-700 dark:text-gray-300" />
      </button>

      <!-- Compact selection menu -->
      <div v-if="isMenuOpen"
           class="absolute top-0 right-full mr-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 shadow-lg p-2">
        <div class="flex flex-col gap-2">
          <button @click="openChat('charlie')"
                  class="flex items-center justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <TheLogo class="w-6 h-6" />
          </button>
          <div class="w-full h-px bg-gray-200 dark:bg-gray-700"></div>
          <button @click="openChat('gemini')"
                  class="flex items-center justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <Gemini class="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>

    <!-- Expanded chat interface -->
    <div v-else
         class="absolute top-1/2 right-0 -translate-y-1/2 w-[380px] bg-white dark:bg-gray-800 rounded-l-lg border border-gray-200 dark:border-gray-700 border-r-0 shadow-lg p-4 transform transition-transform duration-300 md:scale-100 scale-90">
      <div class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-2">
          <component :is="selectedChat === 'charlie' ? 'TheLogo' : 'Gemini'" class="w-6 h-6" />
          <h3 class="text-lg font-semibold">{{ selectedChat === 'charlie' ? 'Charlie' : 'Charlie Gemini' }}</h3>
        </div>
        <button @click="handleChatCollapsed"
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <div class="i-material-symbols-close text-xl"></div>
        </button>
      </div>
      <Charlie v-if="selectedChat === 'charlie'"
              :default-expanded="true"
              @update:expanded="(expanded) => !expanded && handleChatCollapsed()" />
      <CharlieGemini v-if="selectedChat === 'gemini'"
                     :default-expanded="true"
                     @update:expanded="(expanded) => !expanded && handleChatCollapsed()" />
    </div>
  </div>
  <UNotifications />
</template>

<style scoped>
/* Only keep styles that can't be handled by Tailwind */
@media (max-height: 400px) {
  .fixed {
    display: none;
  }
}
</style>
