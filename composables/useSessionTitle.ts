export interface SessionTitleOptions {
  sessionId: number
  model: string
  family: string
  userMessage: string
  autoUpdate?: boolean
  onSuccess?: (title: string) => void
  onError?: (error: any) => void
}

export interface SessionTitleTrigger {
  shouldGenerate: (context: any) => boolean
  extractMessage: (context: any) => string | null
}

// Predefined triggers for common scenarios
export const titleTriggers = {
  firstUserMessage: {
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
  
  onDemand: {
    shouldGenerate: () => true,
    extractMessage: (context: { messageContent: any }) => {
      return typeof context.messageContent === 'string' ? context.messageContent : JSON.stringify(context.messageContent)
    }
  }
}

export function useSessionTitle() {
  // Core API call function
  const generateTitleAPI = async (model: string, family: string, userMessage: string, sessionId: number) => {
    const { getKeysHeader } = await import('~/utils/settings')
    
    const response = await fetch(`/api/sessions/${sessionId}/title`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getKeysHeader()
      },
      body: JSON.stringify({ model, family, userMessage })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const { title } = await response.json()
    return title?.trim() || null
  }

  // Database update function
  const updateSessionInDB = async (sessionId: number, title: string) => {
    const { clientDB } = await import('~/composables/clientDB')
    await clientDB.chatSessions.update(sessionId, { 
      title,
      updateTime: Date.now()
    })
  }

  // Main generation function with options
  const generateSessionTitle = async (options: SessionTitleOptions): Promise<string | null> => {
    try {
      const { sessionId, model, family, userMessage, autoUpdate = true, onSuccess, onError } = options
      
      const title = await generateTitleAPI(model, family, userMessage, sessionId)
      
      if (title) {
        if (autoUpdate) {
          await updateSessionInDB(sessionId, title)
        }
        onSuccess?.(title)
        return title
      }
      
      return null
    } catch (error) {
      console.warn('Failed to generate session title:', error)
      onError?.(error)
      return null
    }
  }

  // Smart generation with trigger logic
  const generateTitleWithTrigger = async (
    trigger: SessionTitleTrigger,
    context: any,
    model: string,
    family: string,
    sessionId: number,
    options?: Partial<SessionTitleOptions>
  ) => {
    if (!trigger.shouldGenerate(context)) {
      return null
    }

    const messageContent = trigger.extractMessage(context)
    if (!messageContent?.trim()) {
      return null
    }

    return generateSessionTitle({
      sessionId,
      model,
      family,
      userMessage: messageContent,
      ...options
    })
  }

  return {
    generateSessionTitle,
    generateTitleWithTrigger,
    generateTitleAPI,
    updateSessionInDB,
    titleTriggers
  }
}