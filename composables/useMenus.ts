
export const DEFAULT_PAGE_LINK = '/welcome'

export function useMenus() {
    const { t } = useI18n()
    const { features } = useFeatures()

    const isKnowledgeBaseEnabled = computed(() => features.value.knowledgeBaseEnabled)
    const isRealtimeChatEnabled = computed(() => features.value.realtimeChatEnabled)
    const isModelsManagementEnabled = computed(() => features.value.modelsManagementEnabled)

    return computed(() => {
        const menus = [
            { label: t('menu.home'), icon: 'i-heroicons-home', to: '/welcome' },
        ]

        // Only add models menu if feature is enabled
        if (isModelsManagementEnabled.value) {
            menus.push({ label: t('menu.models'), icon: 'i-heroicons-rectangle-stack', to: '/models' })
        }

        // Instructions menu is always enabled
        menus.push({ label: t('menu.instructions'), icon: 'i-iconoir-terminal', to: '/instructions' })

        // Only add knowledge base menu if feature is enabled
        if (isKnowledgeBaseEnabled.value) {
            menus.push({ label: t('menu.knowledgeBases'), icon: 'i-heroicons-book-open', to: '/knowledgebases' })
        }

        menus.push({ label: t('menu.chat'), icon: 'i-iconoir-chat-lines', to: '/chat' })

        // Only add realtime menu if feature is enabled
        if (isRealtimeChatEnabled.value) {
            menus.push({ label: t('menu.realtime'), icon: 'i-iconoir-microphone', to: '/realtime' })
        }

        menus.push({ label: t('menu.settings'), icon: 'i-heroicons-cog-6-tooth', to: '/settings' })
        menus.push({ label: 'GitHub', icon: 'i-mdi-github', to: 'https://github.com/sugarforever/chat-ollama', external: true })

        return menus
    })
}
