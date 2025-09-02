export default defineNuxtRouteMiddleware((to) => {
    const features = useFeatures()

    // Check if realtime chat feature is enabled
    if (!features.realtimeChatEnabled) {
        // Redirect to home page if realtime chat feature is disabled
        return navigateTo('/welcome')
    }
})
