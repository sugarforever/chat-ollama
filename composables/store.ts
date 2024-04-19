import { useStorage } from '@vueuse/core'
import { DEFAULT_ATTACHED_MESSAGES_COUNT } from '~/config'

export const chatDefaultSettings = useStorage('chat-default-settings', {
  model: [] as unknown as [string, string],
  attachedMessagesCount: DEFAULT_ATTACHED_MESSAGES_COUNT,
})
