export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig()

  // Check if knowledge base feature is enabled
  if (!config.knowledgeBaseEnabled) {
    // Redirect to home page if knowledge base feature is disabled
    return navigateTo('/welcome')
  }
})
