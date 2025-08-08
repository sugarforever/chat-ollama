export default defineNuxtRouteMiddleware((to) => {
    const config = useRuntimeConfig()

    // Check if instructions feature is enabled
    if (!config.instructionsEnabled) {
        // Redirect to home page if instructions feature is disabled
        return navigateTo('/welcome')
    }
})
