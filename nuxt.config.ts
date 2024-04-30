// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  auth: {
    provider: {
      type: 'local',
      endpoints: {
        getSession: { path: '/user' }
      },
      pages: {
        login: '/'
      },
      token: {
        signInResponseTokenPointer: '/token/accessToken'
      },
      sessionDataType: { id: 'string', email: 'string', name: 'string' }
    },
    session: {
      // Whether to refresh the session every time the browser window is refocused.
      enableRefreshOnWindowFocus: true,

      // Whether to refresh the session every `X` milliseconds. Set this to `false` to turn it off. The session will only be refreshed if a session already exists.
      enableRefreshPeriodically: false
    },
    globalAppMiddleware: {
      isEnabled: false
    }
  },
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@vueuse/nuxt', ['@nuxtjs/google-fonts', {
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
  }], "@sidebase/nuxt-auth",
  ['@nuxtjs/i18n', {
    vueI18n: "@/config/i18n"
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
  runtimeConfig: {
    public: {
      kb: {
        create: {
          role: ''
        }
      },
      modelProxyEnabled: false,
      chatMaxAttachedMessages: 50,
    },
    modelProxyUrl: '',
  }
})
