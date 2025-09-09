import type { SessionTitleTrigger } from '~/composables/useSessionTitle'

export interface AutoTitleConfig {
  enabled: boolean
  trigger: SessionTitleTrigger
  onTitleGenerated?: (title: string, sessionId: number) => void
  onError?: (error: any, sessionId: number) => void
}

export class AutoTitleGenerator {
  private config: AutoTitleConfig
  private useSessionTitle: any

  constructor(config: AutoTitleConfig) {
    this.config = config
  }

  async init() {
    if (!this.useSessionTitle) {
      const { useSessionTitle } = await import('~/composables/useSessionTitle')
      this.useSessionTitle = useSessionTitle()
    }
  }

  async attemptTitleGeneration(
    context: any,
    sessionId: number,
    model: string,
    family: string
  ) {
    if (!this.config.enabled) return

    await this.init()

    const title = await this.useSessionTitle.generateTitleWithTrigger(
      this.config.trigger,
      context,
      model,
      family,
      sessionId,
      {
        onSuccess: (title: string) => {
          this.config.onTitleGenerated?.(title, sessionId)
        },
        onError: (error: any) => {
          this.config.onError?.(error, sessionId)
        }
      }
    )

    return title
  }

  updateConfig(newConfig: Partial<AutoTitleConfig>) {
    this.config = { ...this.config, ...newConfig }
  }
}

// Factory function for common scenarios
export const createAutoTitleGenerator = {
  forFirstMessage: (onTitleGenerated?: (title: string, sessionId: number) => void) => {
    return new AutoTitleGenerator({
      enabled: true,
      trigger: {
        shouldGenerate: (context: { messages: any[], sessionTitle?: string }) => {
          const hasNoTitle = !context.sessionTitle || context.sessionTitle.trim() === ''
          const userMessageCount = context.messages.filter(m => m.role === 'user').length
          return hasNoTitle && userMessageCount === 1
        },
        extractMessage: (context: { messageContent: any }) => {
          const content = context.messageContent
          if (Array.isArray(content)) {
            return content
              .filter(item => item.type === 'text' && item.text)
              .map(item => item.text)
              .join(' ')
          }
          return content
        }
      },
      onTitleGenerated
    })
  },

  disabled: () => {
    return new AutoTitleGenerator({
      enabled: false,
      trigger: { shouldGenerate: () => false, extractMessage: () => null }
    })
  }
}