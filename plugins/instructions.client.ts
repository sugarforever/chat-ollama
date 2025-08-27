export default defineNuxtPlugin(() => {
  // Preload instructions when the app starts
  if (process.client) {
    // Use nextTick to ensure the app is fully initialized
    nextTick(async () => {
      try {
        const { preloadInstructions } = useInstructionsCache()
        await preloadInstructions()
      } catch (error) {
        console.error('Failed to preload instructions on app start:', error)
      }
    })
  }
})