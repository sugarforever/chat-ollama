interface FeatureFlags {
  knowledgeBaseEnabled: boolean
  realtimeChatEnabled: boolean
  modelsManagementEnabled: boolean
  mcpEnabled: boolean
}

// Global state to prevent multiple fetches
const _featuresData = ref<FeatureFlags | null>(null)
const _featuresPending = ref(false)
const _featuresError = ref<any>(null)
const _featuresInitialized = ref(false)

export function useFeatures() {
  // Only fetch once globally
  if (!_featuresInitialized.value) {
    _featuresInitialized.value = true
    _featuresPending.value = true

    $fetch<{ success: boolean; data: FeatureFlags }>('/api/features')
      .then(response => {
        _featuresData.value = response.data
        _featuresError.value = null
      })
      .catch(error => {
        _featuresError.value = error
        _featuresData.value = {
          knowledgeBaseEnabled: false,
          realtimeChatEnabled: false,
          modelsManagementEnabled: false,
          mcpEnabled: false
        }
      })
      .finally(() => {
        _featuresPending.value = false
      })
  }

  const refresh = async () => {
    _featuresPending.value = true
    try {
      const response = await $fetch<{ success: boolean; data: FeatureFlags }>('/api/features')
      _featuresData.value = response.data
      _featuresError.value = null
    } catch (error) {
      _featuresError.value = error
    } finally {
      _featuresPending.value = false
    }
  }

  return {
    features: computed(() => _featuresData.value || {
      knowledgeBaseEnabled: false,
      realtimeChatEnabled: false,
      modelsManagementEnabled: false,
      mcpEnabled: false
    }),
    pending: readonly(_featuresPending),
    error: readonly(_featuresError),
    refresh
  }
}
