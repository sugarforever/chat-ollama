import type { Component } from 'vue'

// Type definitions for supported brands
export type BrandKey = 'openai' | 'anthropic' | 'azure' | 'deepseek' | 'gemini' | 'groq' | 'moonshot' | 'siliconcloud' | 'ollama'

export interface BrandIconData {
  name: string
  component: Component
  fallbackIcon: string
}

// Lazy-loaded brand icon components
const brandIcons: Record<BrandKey, () => Promise<Component>> = {
  openai: () => import('~/assets/svg/openai.svg'),
  anthropic: () => import('~/assets/svg/anthropic.svg'),
  azure: () => import('~/assets/svg/azure.svg'),
  deepseek: () => import('~/assets/svg/deepseek.svg'),
  gemini: () => import('~/assets/svg/gemini.svg'),
  groq: () => import('~/assets/svg/groq.svg'),
  moonshot: () => import('~/assets/svg/moonshot.svg'),
  siliconcloud: () => import('~/assets/svg/siliconcloud.svg'),
  ollama: () => import('~/assets/svg/ollama.svg')
}

// Fallback icons for each brand
const fallbackIcons: Record<BrandKey, string> = {
  openai: 'i-simple-icons-openai',
  anthropic: 'i-material-symbols-psychology',
  azure: 'i-simple-icons-microsoftazure',
  deepseek: 'i-material-symbols-psychology',
  gemini: 'i-simple-icons-googlegemini',
  groq: 'i-material-symbols-speed',
  moonshot: 'i-material-symbols-rocket',
  siliconcloud: 'i-material-symbols-cloud',
  ollama: 'i-material-symbols-tune'
}

// Brand display names
const brandNames: Record<BrandKey, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  groq: 'Groq',
  moonshot: 'Moonshot',
  siliconcloud: 'Silicon Cloud',
  ollama: 'Ollama'
}

// Map server keys to brand keys
const serverToBrandMap: Record<string, BrandKey> = {
  ollamaServer: 'ollama',
  openAi: 'openai',
  azureOpenAi: 'azure',
  anthropic: 'anthropic',
  moonshot: 'moonshot',
  gemini: 'gemini',
  groq: 'groq',
  deepseek: 'deepseek',
  siliconcloud: 'siliconcloud'
}

/**
 * Composable for managing brand icons with lazy loading and fallbacks
 */
export function useBrandIcons() {
  const loadedIcons = ref<Map<BrandKey, Component>>(new Map())
  const loadingStates = ref<Map<BrandKey, boolean>>(new Map())

  /**
   * Load a brand icon component
   */
  const loadBrandIcon = async (brandKey: BrandKey): Promise<Component | null> => {
    if (loadedIcons.value.has(brandKey)) {
      return loadedIcons.value.get(brandKey)!
    }

    if (loadingStates.value.get(brandKey)) {
      // Wait for existing load to complete
      return new Promise((resolve) => {
        const checkLoaded = () => {
          if (loadedIcons.value.has(brandKey)) {
            resolve(loadedIcons.value.get(brandKey)!)
          } else if (!loadingStates.value.get(brandKey)) {
            resolve(null)
          } else {
            setTimeout(checkLoaded, 10)
          }
        }
        checkLoaded()
      })
    }

    try {
      loadingStates.value.set(brandKey, true)
      const iconLoader = brandIcons[brandKey]
      const component = await iconLoader()
      loadedIcons.value.set(brandKey, component)
      return component
    } catch (error) {
      console.warn(`Failed to load brand icon for ${brandKey}:`, error)
      return null
    } finally {
      loadingStates.value.set(brandKey, false)
    }
  }

  /**
   * Get brand icon data for a server key
   */
  const getBrandIconData = (serverKey: string): BrandIconData | null => {
    const brandKey = serverToBrandMap[serverKey]
    if (!brandKey) return null

    return {
      name: brandNames[brandKey],
      component: loadedIcons.value.get(brandKey) || markRaw(defineComponent({
        template: `<div class="brand-icon-placeholder"></div>`
      })),
      fallbackIcon: fallbackIcons[brandKey]
    }
  }

  /**
   * Get fallback icon for a server
   */
  const getFallbackIcon = (serverKey: string): string => {
    const brandKey = serverToBrandMap[serverKey]
    return brandKey ? fallbackIcons[brandKey] : 'i-material-symbols-server'
  }

  /**
   * Check if a brand icon is available
   */
  const hasBrandIcon = (serverKey: string): boolean => {
    return serverKey in serverToBrandMap
  }

  /**
   * Preload commonly used brand icons
   */
  const preloadCommonIcons = async (): Promise<void> => {
    const commonBrands: BrandKey[] = ['openai', 'anthropic', 'gemini', 'ollama']
    await Promise.allSettled(
      commonBrands.map(brand => loadBrandIcon(brand))
    )
  }

  return {
    loadBrandIcon,
    getBrandIconData,
    getFallbackIcon,
    hasBrandIcon,
    preloadCommonIcons,
    brandNames: readonly(brandNames),
    serverToBrandMap: readonly(serverToBrandMap),
    isLoading: (brandKey: BrandKey) => loadingStates.value.get(brandKey) || false
  }
}
