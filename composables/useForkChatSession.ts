import type { ChatMessage } from '~/types/chat'

export function useForkChatSession() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()

  const forkChatSession = async (originalSessionId: number, forkFromMessageId: number) => {
    try {
      // Get the original session data
      const originalSession = await clientDB.chatSessions.get(originalSessionId)
      if (!originalSession) {
        toast.add({ 
          title: t('chat.forkError'), 
          description: t('chat.forkSessionNotFound'), 
          color: 'red' 
        })
        return null
      }

      // Get all messages up to and including the fork point
      const allMessages = await clientDB.chatHistories
        .where('sessionId')
        .equals(originalSessionId)
        .sortBy('id')

      const forkFromIndex = allMessages.findIndex(msg => msg.id === forkFromMessageId)
      if (forkFromIndex === -1) {
        toast.add({ 
          title: t('chat.forkError'), 
          description: t('chat.forkMessageNotFound'), 
          color: 'red' 
        })
        return null
      }

      const messagesToFork = allMessages.slice(0, forkFromIndex + 1)

      // Create new session with forked data
      const newSessionData = {
        title: `${originalSession.title || t('chat.forkDefaultTitle')} (${t('chat.forkForkedSuffix')})`,
        createTime: Date.now(),
        updateTime: Date.now(),
        models: originalSession.models,
        instructionId: originalSession.instructionId,
        knowledgeBaseId: originalSession.knowledgeBaseId,
        attachedMessagesCount: originalSession.attachedMessagesCount,
        enableToolUsage: originalSession.enableToolUsage,
        isTop: 0,
      }

      // Create the new session
      const newSessionId = await clientDB.chatSessions.add(newSessionData)

      // Copy messages to the new session
      const newMessages = messagesToFork.map(msg => ({
        ...msg,
        sessionId: newSessionId,
        id: undefined, // Let IndexedDB assign new IDs
      }))

      await clientDB.chatHistories.bulkAdd(newMessages)

      toast.add({ 
        title: t('chat.forkSuccess'), 
        description: t('chat.forkSuccessDescription'), 
        color: 'green' 
      })

      // Navigate to the new forked session
      await router.push(`/chat/${newSessionId}`)

      return newSessionId
    } catch (error) {
      console.error('Error forking chat session:', error)
      toast.add({ 
        title: t('chat.forkError'), 
        description: t('chat.forkGenericError'), 
        color: 'red' 
      })
      return null
    }
  }

  return {
    forkChatSession
  }
}