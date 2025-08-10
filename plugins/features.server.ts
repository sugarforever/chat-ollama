export default defineNuxtPlugin(async () => {
    // Only run on server
    if (process.client) return

    try {
        const config = useRuntimeConfig()
        const features = {
            knowledgeBaseEnabled: Boolean(config.knowledgeBaseEnabled),
            realtimeChatEnabled: Boolean(config.realtimeChatEnabled),
            modelsManagementEnabled: Boolean(config.modelsManagementEnabled),
            mcpEnabled: Boolean(config.mcpEnabled)
        }

        // Inject features into SSR context and payload
        const nuxtApp = useNuxtApp()
        if (nuxtApp.ssrContext) {
            nuxtApp.ssrContext.features = features
        }
        nuxtApp.payload.features = features
    } catch (error) {
        console.error('Error setting up features:', error)
        // Provide safe defaults
        const nuxtApp = useNuxtApp()
        const fallbackFeatures = {
            knowledgeBaseEnabled: false,
            realtimeChatEnabled: false,
            modelsManagementEnabled: false,
            mcpEnabled: false
        }
        if (nuxtApp.ssrContext) {
            nuxtApp.ssrContext.features = fallbackFeatures
        }
        nuxtApp.payload.features = fallbackFeatures
    }
})
