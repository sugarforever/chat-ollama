import type { ContextKeys } from '~/server/middleware/keys'

declare module 'h3' {
  interface H3EventContext {
    keys: ContextKeys
  }
}
