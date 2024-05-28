import { useStorage } from '@vueuse/core'
import { DEFAULT_ATTACHED_MESSAGES_COUNT, MODEL_FAMILY_SEPARATOR } from '~/config'

export const chatDefaultSettings = useStorage('chat-default-settings', {
  models: [] as string[],
  attachedMessagesCount: DEFAULT_ATTACHED_MESSAGES_COUNT,
})

// incompatible with old data format
const model = (chatDefaultSettings.value as any).model
if (model) {
  if (Array.isArray(model)) {
    const models = [model.concat().reverse().join(MODEL_FAMILY_SEPARATOR)]
    chatDefaultSettings.value = {
      models,
      attachedMessagesCount: chatDefaultSettings.value.attachedMessagesCount || DEFAULT_ATTACHED_MESSAGES_COUNT,
    }
  } else {
    chatDefaultSettings.value = null
  }
}
