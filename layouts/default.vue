<script lang="ts" setup>
import { useStorage } from '@vueuse/core'
const route = useRoute()
const links = useMenus()

const open = ref(false)
const isMenuOpen = ref(false)
const isChatExpanded = ref(false)
const selectedChat = ref<'charlie' | 'gemini' | null>(null)
const isLeftPanelCollapsed = ref(false)

// Add realtime chat setting
const realtimeChatEnabled = useStorage('realtimeChatEnabled', false)

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

const toggleLeftPanel = () => {
  isLeftPanelCollapsed.value = !isLeftPanelCollapsed.value
}
</script>

<template>
  <div class="h-screen flex">
    <!-- Left Navigation Panel -->
    <div class="hidden md:flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300"
         :class="isLeftPanelCollapsed ? 'w-16' : 'w-54'">
      <!-- Logo and App Name -->
      <div class="flex h-14 items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center min-w-0">
          <TheLogo class="w-8 h-8 flex-shrink-0" />
          <span v-if="!isLeftPanelCollapsed" class="ml-2 text-primary font-semibold text-lg truncate">
            {{ $config.public.appName }}
          </span>
        </div>
        <!-- Collapse Toggle -->
        <button @click="toggleLeftPanel"
                class="flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
          <Icon :name="isLeftPanelCollapsed ? 'i-heroicons-chevron-double-right' : 'i-heroicons-chevron-double-left'"
                class="w-4 h-4" />
        </button>
      </div>

      <!-- Navigation Menu -->
      <nav class="flex-1 p-4 space-y-2">
        <NuxtLink v-for="link in links" :key="link.to" :to="link.to"
                  class="flex items-center p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                  :class="{ 'justify-center': isLeftPanelCollapsed }"
                  active-class="!bg-primary-50 dark:!bg-primary-900/20 !text-primary-600 dark:!text-primary-400">
          <Icon :name="link.icon" class="w-5 h-5 flex-shrink-0" />
          <span v-if="!isLeftPanelCollapsed" class="ml-3 truncate">{{ link.label }}</span>
          <!-- Tooltip for collapsed state -->
          <div v-if="isLeftPanelCollapsed"
               class="absolute left-16 ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {{ link.label }}
          </div>
        </NuxtLink>
      </nav>

      <!-- Bottom Section -->
      <div :class="`flex ${isLeftPanelCollapsed ? 'flex-col' : 'flex-row'} p-4 border-t border-gray-200 dark:border-gray-700`">
        <!-- Color Mode Toggle -->
        <div class="flex items-center" :class="isLeftPanelCollapsed ? 'justify-center' : 'justify-start'">
          <ColorMode />
        </div>

        <!-- GitHub Link -->
        <div class="flex items-center" :class="isLeftPanelCollapsed ? 'justify-center' : 'justify-start'">
          <UButton color="gray"
                   variant="ghost"
                   icon="i-mdi-github"
                   aria-label="GitHub"
                   :to="'https://github.com/sugarforever/chat-ollama'"
                   target="_blank"
                   :external="true" />
        </div>

        <!-- Auth Component -->
        <!--
        <div class="flex items-center" :class="isLeftPanelCollapsed ? 'justify-center' : 'justify-start'">
          <Auth :collapsed="isLeftPanelCollapsed" />
        </div>
        -->
      </div>
    </div>

    <!-- Mobile Menu Overlay -->
    <div class="md:hidden fixed inset-0 z-50" v-if="open">
      <div class="fixed inset-0 bg-black bg-opacity-50" @click="open = false"></div>
      <div class="fixed left-0 top-0 h-full w-54 bg-white dark:bg-gray-900 shadow-lg flex flex-col overflow-y-scroll">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div class="flex items-center">
            <TheLogo class="w-8 h-8" />
            <span class="ml-3 text-primary font-semibold text-base">{{ $config.public.appName }}</span>
          </div>
          <button @click="open = false" class="ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <Icon name="i-heroicons-x-mark" class="w-6 h-6" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden">
          <MobileMenu />
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Mobile Header -->
      <div class="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button @click="open = true" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <Icon name="i-heroicons-bars-3" class="w-6 h-6" />
        </button>
        <div class="flex items-center">
          <TheLogo class="w-6 h-6" />
          <span class="ml-2 text-primary font-semibold">{{ $config.public.appName }}</span>
        </div>
        <div class="w-6"></div> <!-- Spacer for centering -->
      </div>

      <!-- Main Content -->
      <main class="flex-1 h-full overflow-scroll p-4">
        <slot />
      </main>
    </div>
  </div>

  <!-- Realtime Chat Feature (unchanged) -->
  <ClientOnly>
    <div v-if="realtimeChatEnabled" class="fixed top-1/2 right-0 -translate-y-1/2 z-40">
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
  </ClientOnly>
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
