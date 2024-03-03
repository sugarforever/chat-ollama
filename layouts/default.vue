<script setup>
const route = useRoute()

const links = [
  [{
    label: 'Home',
    icon: 'i-heroicons-home',
    to: '/'
  }, {
    label: 'Models',
    icon: 'i-heroicons-rectangle-stack',
    to: '/models'
  }, {
    label: 'Instructions',
    icon: 'i-heroicons-document-text',
    to: '/instructions'
  }, {
    label: 'Knowledge Bases',
    icon: 'i-heroicons-book-open',
    to: '/knowledgebases'
  }, {
    label: 'Chat',
    icon: 'i-heroicons-pencil-square',
    to: '/chat'
  }, {
    label: 'Settings',
    icon: 'i-heroicons-cog-6-tooth',
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
