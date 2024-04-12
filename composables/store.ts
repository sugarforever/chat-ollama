import { useStorage } from '@vueuse/core'
import { DEFAULT_ATTACHED_MESSAGES_COUNT } from '~/config'

export const chatDefaultSettings = useStorage('chat-default-settings', {
  model: '',
  attachedMessagesCount: DEFAULT_ATTACHED_MESSAGES_COUNT,
})
