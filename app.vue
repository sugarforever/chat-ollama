<script setup>
// Handle Google OAuth success redirect
const route = useRoute()
const { refresh } = useAuth()

onMounted(async () => {
  // If redirected from Google OAuth, refresh the auth session
  if (route.query.auth === 'success') {
    await refresh()
    // Clean up the URL
    await navigateTo(route.path, { replace: true })
  }
})
</script>

<template>
  <div class="h-full">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <USlideovers />
    <UModals />
  </div>
</template>
