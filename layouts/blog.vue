<script lang="ts" setup>
const route = useRoute()
const mobileMenu = ref<HTMLElement>()


const toggleMobileMenu = () => {
  if (mobileMenu.value) {
    mobileMenu.value.classList.toggle('hidden')
  }
}
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-300">
    <!-- Navigation Header -->
    <header class="bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50">
      <div class="max-w-6xl mx-auto px-6 lg:px-8">
        <div class="flex justify-between items-center h-20">
          <!-- Logo and Home Link -->
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center space-x-3 hover:opacity-80 transition-all duration-200">
              <TheLogo class="w-6 h-6" />
              <span class="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                {{ $config.public.appName }}
              </span>
            </NuxtLink>
          </div>

          <!-- Navigation Links -->
          <nav class="hidden md:flex items-center space-x-1">
            <NuxtLink to="/blogs"
                      class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 relative"
                      :class="{ 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800': route.path.startsWith('/blogs') }">
              Blog
            </NuxtLink>
            <NuxtLink to="/"
                      class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-full text-sm font-medium transition-all duration-200">
              Chat
            </NuxtLink>
          </nav>

          <!-- Mobile Menu Button & Theme Toggle -->
          <div class="flex items-center space-x-2">
            <!-- Theme Toggle -->
            <ClientOnly>
              <UButton
                       variant="ghost"
                       size="sm"
                       square
                       @click="$colorMode.preference = $colorMode.value === 'dark' ? 'light' : 'dark'"
                       class="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-full p-2 transition-all duration-200">
                <UIcon
                       :name="$colorMode.value === 'dark' ? 'i-heroicons-sun-20-solid' : 'i-heroicons-moon-20-solid'"
                       class="w-5 h-5" />
              </UButton>
            </ClientOnly>

            <!-- Mobile menu button -->
            <div class="md:hidden">
              <UButton
                       variant="ghost"
                       size="sm"
                       square
                       @click="toggleMobileMenu"
                       class="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-full p-2 transition-all duration-200">
                <UIcon name="i-heroicons-bars-3-20-solid" class="w-6 h-6" />
              </UButton>
            </div>
          </div>
        </div>

        <!-- Mobile Navigation Menu -->
        <div ref="mobileMenu" class="md:hidden border-t border-gray-100 dark:border-gray-800 py-6 hidden">
          <nav class="space-y-1">
            <NuxtLink to="/blogs"
                      class="block px-4 py-3 rounded-xl text-base font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200"
                      :class="{ 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800': route.path.startsWith('/blogs') }">
              Blog
            </NuxtLink>
            <NuxtLink to="/"
                      class="block px-4 py-3 rounded-xl text-base font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200">
              Chat
            </NuxtLink>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 mt-auto">
      <div class="max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div class="flex items-center space-x-8">
            <NuxtLink to="/blogs" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 font-medium">
              Blog
            </NuxtLink>
            <NuxtLink to="/" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 font-medium">
              Chat
            </NuxtLink>
            <a href="https://github.com/sugarforever/chat-ollama" target="_blank" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 font-medium">
              GitHub
            </a>
          </div>
        </div>

        <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700 text-center">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            &copy; {{ new Date().getFullYear() }} {{ $config.public.appName }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
