<script setup lang="ts">
import { useStorage } from '@vueuse/core'

// Redirect to the dynamic route structure
const router = useRouter()

// Redirect /chat to /chat/0 (or to first available session)
onMounted(async () => {
  try {
    // Try to get the current session or redirect to empty state
    const currentSessionId = useStorage<number>('currentSessionId', 0)
    
    if (currentSessionId.value > 0) {
      // Verify session exists
      const session = await clientDB.chatSessions.get(currentSessionId.value)
      if (session) {
        await router.replace(`/chat/${currentSessionId.value}`)
        return
      }
    }
    
    // No valid session, redirect to empty chat
    await router.replace('/chat/0')
  } catch (error) {
    console.error('Error during chat redirect:', error)
    // Fallback to empty chat
    await router.replace('/chat/0')
  }
})
</script>

<template>
  <div class="h-full flex items-center justify-center">
    <div class="text-center space-y-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p class="text-gray-600 dark:text-gray-400">Redirecting...</p>
    </div>
  </div>
</template>
