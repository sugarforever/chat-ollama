export function useMenus() {
  const { t } = useI18n()

  return computed(() => [
    { label: t('menu.home'), icon: 'i-heroicons-home', to: '/' },
    { label: t('menu.models'), icon: 'i-heroicons-rectangle-stack', to: '/models' },
    { label: t('menu.instructions'), icon: 'i-iconoir-terminal', to: '/instructions' },
    { label: t('menu.knowledgeBases'), icon: 'i-heroicons-book-open', to: '/knowledgebases' },
    { label: t('menu.chat'), icon: 'i-iconoir-chat-lines', to: '/chat' },
    { label: t('menu.settings'), icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
  ])
}
