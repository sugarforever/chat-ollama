export default defineNuxtRouteMiddleware((to) => {
  const features = useFeatures()

  // Check if models management feature is enabled
  if (!features.modelsManagementEnabled) {
    // Redirect to home page if models management feature is disabled
    return navigateTo('/welcome')
  }
})
