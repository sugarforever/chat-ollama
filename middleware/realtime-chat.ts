export default defineNuxtRouteMiddleware((to) => {
    const config = useRuntimeConfig()

    // Check if realtime chat feature is enabled
    if (!config.realtimeChatEnabled) {
        // Redirect to home page if realtime chat feature is disabled
        return navigateTo('/welcome')
    }
})
