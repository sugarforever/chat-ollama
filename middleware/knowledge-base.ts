export default defineNuxtRouteMiddleware((to) => {
  const features = useFeatures()

  console.log(`[${process.server ? 'SERVER' : 'CLIENT'}] Knowledge base middleware - knowledgeBaseEnabled:`, features.knowledgeBaseEnabled)

  // Check if knowledge base feature is enabled
  if (!features.knowledgeBaseEnabled) {
    console.log(`[${process.server ? 'SERVER' : 'CLIENT'}] Redirecting to /welcome because knowledgeBaseEnabled is false`)
    // Redirect to home page if knowledge base feature is disabled
    return navigateTo('/welcome')
  }

  console.log(`[${process.server ? 'SERVER' : 'CLIENT'}] Knowledge base access allowed`)
})
