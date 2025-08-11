<script setup lang="ts">
const { t } = useI18n()
const router = useRouter()

const { signOut } = useAuth()

const performLogout = async () => {
  try {
    await signOut()
  } catch (error) {
    console.error('Logout error:', error)
    // Still redirect even if there's an error
    await router.push('/')
  }
}

// Auto logout on page load
onMounted(() => {
  performLogout()
})
</script>
<template>
  <ClientOnly>
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold mb-4">{{ t('auth.signOut') }}</h1>
        <p class="mb-4">{{ t('auth.signingOut') || 'Signing out...' }}</p>
        <UButton @click="performLogout">{{ t("auth.signOut") }}</UButton>
      </div>
    </div>
  </ClientOnly>
</template>
