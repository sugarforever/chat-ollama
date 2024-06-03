<script lang="ts" setup>
const route = useRoute()
const links = useMenus()

const open = ref(false)

watch(() => route.path, () => {
  open.value = false
})
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
  <UNotifications />
</template>
