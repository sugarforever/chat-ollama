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
  ui: {
    icons: ['heroicons', 'iconoir']
  },
  css: [
    '~/assets/index.scss',
  ]
})
