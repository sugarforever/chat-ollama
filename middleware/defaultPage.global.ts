
export default defineNuxtRouteMiddleware((to, from) => {
  const defaultPage = useCookie('default-page', { path: '/', default: () => DEFAULT_PAGE_LINK })

  if (to.path === '/') {
    return navigateTo(defaultPage.value)
  }
})
