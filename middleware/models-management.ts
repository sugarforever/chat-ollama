export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig()

  // Check if models management feature is enabled
  if (!config.modelsManagementEnabled) {
    // Redirect to home page if models management feature is disabled
    return navigateTo('/welcome')
  }
})
