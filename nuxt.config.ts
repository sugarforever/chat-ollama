import { LanguageList } from './config/i18n'
import { APP_NAME } from './config/index'
import svgLoader from 'vite-svg-loader'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  auth: {
    provider: {
      type: 'local',
      endpoints: {
        getSession: { path: '/user', method: 'get' }
      },
      pages: {
        login: '/login'
      },
      token: {
        signInResponseTokenPointer: '/token/accessToken',
        type: 'Bearer',
        cookieName: 'auth-token',
        headerName: 'Authorization',
        name: 'auth-token',
        maxAgeInSeconds: 60 * 60 * 24 * 365
      },
      sessionDataType: { id: 'string', email: 'string', name: 'string', role: 'string' }
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
  devtools: { enabled: false },
  modules: [
    '@nuxt/ui', '@vueuse/nuxt',
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
    }],
    "@sidebase/nuxt-auth",
    ['@nuxtjs/i18n', {
      vueI18n: "@/config/nuxtjsI18n"
    }]
  ],
  nitro: {
    experimental: {
      openAPI: true
    }
  },
  ui: {
    icons: ['heroicons', 'iconoir', 'material-symbols', 'mdi', 'svg-spinners']
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
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width',
        },
        {
          'http-equiv': 'origin-trial',
          content: process.env.CHROME_TRIAL_TOKEN_PROMPT_API || '',
        }
      ],
      title: APP_NAME,
    }
  },
  runtimeConfig: {
    // Server-side only (not exposed to client)
    knowledgeBaseEnabled: process.env.KNOWLEDGE_BASE_ENABLED === 'true',
    realtimeChatEnabled: process.env.REALTIME_CHAT_ENABLED === 'true',
    modelsManagementEnabled: process.env.MODELS_MANAGEMENT_ENABLED === 'true',
    mcpEnabled: process.env.MCP_ENABLED === 'true',

    public: {
      kb: {
        create: {
          role: ''
        }
      },
      modelProxyEnabled: false,
      chatMaxAttachedMessages: 50,
      appName: APP_NAME,
      tavilyApiKey: ''
    },
    modelProxyUrl: ''
  },
  i18n: {
    //Asynchronous call, on-demand loading
    locales: LanguageList,
    lazy: true,
    langDir: 'locales/',
    defaultLocale: 'en-US',//def Language, please use Language code
    strategy: "no_prefix",
    compilation: {
      strictMessage: false,
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },
  vite: {
    plugins: [
      svgLoader({
        defaultImport: 'component'
      })
    ],
    vue: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => false
        }
      }
    },
    worker: {
      format: 'es'
    },
    resolve: {
      alias: {
        'vue$': 'vue/dist/vue.esm-bundler.js'
      }
    }
  }
})
