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
    icon: 'i-iconoir-terminal',
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
  <UHorizontalNavigation :links="links" class="border-b border-gray-200 dark:border-gray-800" />

  <div id="main" class="p-4 box-border overflow-auto" style="height: calc(100% - 61px)">
    <slot />
  </div>
  <UNotifications />
</template>
