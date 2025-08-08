
export const DEFAULT_PAGE_LINK = '/welcome'

export function useMenus() {
    const { t } = useI18n()
    const config = useRuntimeConfig()
    const isKnowledgeBaseEnabled = computed(() => config.public.knowledgeBaseEnabled)

    return computed(() => {
        const menus = [
            { label: t('menu.home'), icon: 'i-heroicons-home', to: '/welcome' },
            { label: t('menu.models'), icon: 'i-heroicons-rectangle-stack', to: '/models' },
            { label: t('menu.instructions'), icon: 'i-iconoir-terminal', to: '/instructions' },
        ]

        // Only add knowledge base menu if feature is enabled
        if (isKnowledgeBaseEnabled.value) {
            menus.push({ label: t('menu.knowledgeBases'), icon: 'i-heroicons-book-open', to: '/knowledgebases' })
        }

        menus.push(
            { label: t('menu.chat'), icon: 'i-iconoir-chat-lines', to: '/chat' },
            { label: t('menu.realtime'), icon: 'i-iconoir-microphone', to: '/realtime' },
            { label: t('menu.settings'), icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
        )

        return menus
    })
}
