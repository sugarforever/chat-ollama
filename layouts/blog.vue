<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo and Brand -->
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <TheLogo class="w-8 h-8" />
              <span class="text-xl font-bold text-gray-900 dark:text-white">
                {{ $config.public.appName }}
              </span>
            </NuxtLink>
          </div>

          <!-- Navigation -->
          <div class="flex-1 flex justify-center">
            <nav class="hidden md:flex items-center space-x-8">
              <NuxtLink
                        to="/blog"
                        class="text-primary-600 dark:text-primary-400 font-medium"
                        active-class="!text-primary-600 dark:!text-primary-400">
                {{ $t('menu.blog', 'Blog') }}
              </NuxtLink>
              <NuxtLink
                        to="/chat"
                        class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                {{ $t('menu.chat', 'Chat') }}
              </NuxtLink>
            </nav>
          </div>

          <!-- Mobile menu button -->
          <div class="md:hidden">
            <button
                    @click="mobileMenuOpen = !mobileMenuOpen"
                    class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              <Icon :name="mobileMenuOpen ? 'heroicons:x-mark' : 'heroicons:bars-3'" class="w-6 h-6" />
            </button>
          </div>

          <!-- Theme toggle -->
          <div class="hidden md:flex items-center">
            <ColorMode />
          </div>
        </div>

        <!-- Mobile menu -->
        <div v-if="mobileMenuOpen" class="md:hidden border-t border-gray-200 dark:border-gray-700 py-4">
          <div class="flex flex-col space-y-3">
            <NuxtLink
                      to="/"
                      @click="mobileMenuOpen = false"
                      class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
              {{ $t('menu.home', 'Home') }}
            </NuxtLink>
            <NuxtLink
                      to="/blog"
                      @click="mobileMenuOpen = false"
                      class="text-primary-600 dark:text-primary-400 font-medium">
              {{ $t('menu.blog', 'Blog') }}
            </NuxtLink>
            <NuxtLink
                      to="/chat"
                      @click="mobileMenuOpen = false"
                      class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
              {{ $t('menu.chat', 'Chat') }}
            </NuxtLink>
            <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
              <ColorMode />
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col md:flex-row items-center justify-between">
          <div class="flex items-center space-x-3 mb-4 md:mb-0">
            <TheLogo class="w-6 h-6" />
            <span class="text-gray-600 dark:text-gray-400">
              © {{ new Date().getFullYear() }} {{ $config.public.appName }}. All rights reserved.
            </span>
          </div>

          <div class="flex items-center space-x-6">
            <NuxtLink
                      to="https://github.com/sugarforever/chat-ollama"
                      target="_blank"
                      class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <Icon name="mdi:github" class="w-5 h-5" />
            </NuxtLink>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const mobileMenuOpen = ref(false)

// Close mobile menu when route changes
const route = useRoute()
watch(() => route.path, () => {
  mobileMenuOpen.value = false
})
</script>
