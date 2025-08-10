interface FeatureFlags {
  knowledgeBaseEnabled: boolean
  realtimeChatEnabled: boolean
  modelsManagementEnabled: boolean
  mcpEnabled: boolean
}

// Global reactive state to ensure consistent values across hydration
const _featuresState = ref<FeatureFlags>({
  knowledgeBaseEnabled: false,
  realtimeChatEnabled: false,
  modelsManagementEnabled: false,
  mcpEnabled: false
})

// Flag to track if features have been initialized
const _featuresInitialized = ref(false)

export function useFeatures(): FeatureFlags {
  // Initialize features if not already done
  if (!_featuresInitialized.value) {
    let features: FeatureFlags

    // Server-side: get from runtime config
    if (process.server) {
      const config = useRuntimeConfig()
      features = {
        knowledgeBaseEnabled: Boolean(config.knowledgeBaseEnabled),
        realtimeChatEnabled: Boolean(config.realtimeChatEnabled),
        modelsManagementEnabled: Boolean(config.modelsManagementEnabled),
        mcpEnabled: Boolean(config.mcpEnabled)
      }
    } else {
      // Client-side: get from SSR payload with proper fallback during hydration
      const nuxtApp = useNuxtApp()

      // Try to get features from payload first (set by server plugin)
      let payloadFeatures = nuxtApp.payload.features as FeatureFlags | undefined

      // If not available yet, try from ssrContext
      if (!payloadFeatures) {
        payloadFeatures = nuxtApp.ssrContext?.features as FeatureFlags | undefined
      }

      // Final fallback for hydration safety - ensure we always have valid FeatureFlags
      if (!payloadFeatures ||
        typeof payloadFeatures.knowledgeBaseEnabled === 'undefined') {
        features = {
          knowledgeBaseEnabled: false,
          realtimeChatEnabled: false,
          modelsManagementEnabled: false,
          mcpEnabled: false
        }
      } else {
        features = payloadFeatures
      }
    }

    // Update the reactive state
    _featuresState.value = features
    _featuresInitialized.value = true
  }

  return _featuresState.value
}
