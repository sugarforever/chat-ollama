// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    ['@nuxtjs/google-fonts', {
      families: {
        'Noto Sans': true,
        'Josefin+Sans': true,
        Lato: [100, 300],
        Raleway: {
          wght: [100, 400],
          ital: [100]
        },
        Inter: '200..700',
        'Crimson Pro': {
          wght: '200..900',
          ital: '200..700',
        }
      }
    }]
  ],
  nitro: {
    experimental: {
      openAPI: true
    }
  },
  ui: {
    icons: ['heroicons', 'iconoir', 'material-symbols', 'mdi']
  },
  css: [
    '~/assets/index.scss',
  ],
  app: {
    head: {
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/logo.svg',
        },
      ]
    }
  },
})
