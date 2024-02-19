<script setup>
const route = useRoute()

const links = [
  [{
    label: 'Home',
    icon: 'i-heroicons-home',
    to: '/'
  }, {
    label: 'Models',
    icon: 'i-heroicons-home',
    to: '/models'
  }, {
    label: 'Chat',
    icon: 'i-heroicons-chart-bar',
    to: '/chat'
  }, {
    label: 'Settings',
    icon: 'i-heroicons-chart-bar',
    to: '/settings'
  }], [{
    label: 'ChatOllama',
    labelClass: 'text-2xl font-semibold text-primary'
  }]
]
</script>
<template>
  <div class="h-screen flex flex-col w-full">
    <UHorizontalNavigation :links="links" class="border-b border-gray-200 dark:border-gray-800" />

    <div class="p-4 flex flex-1 overflow-y-scroll justify-center">
      <slot />
    </div>
    <UNotifications />
  </div>
</template>
