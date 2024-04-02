import { DEFAULT_ATTACHED_MESSAGES_COUNT } from '~/config'

interface ChatSessionBaseData extends Omit<ChatSession, 'id'> { }

export async function createChatSession(params?: Partial<Omit<ChatSessionBaseData, 'attachedMessagesCount' | 'createTime' | 'updateTime'>>) {
  const baseData: ChatSessionBaseData = {
    createTime: Date.now(),
    updateTime: Date.now(),
    title: params?.title || '',
    model: params?.model || '',
    modelFamily: params?.modelFamily || '',
    instructionId: params?.instructionId || 0,
    knowledgeBaseId: params?.knowledgeBaseId || 0,
    attachedMessagesCount: DEFAULT_ATTACHED_MESSAGES_COUNT,
  }

  // set default model
  const models = await loadModels()
  if (models.length === 0) {
    const toast = useToast()
    toast.add({ title: 'No model found', description: 'Please download a model first.', color: 'red' })
  } else {
    const model = models[0]
    baseData.model = model.value
    baseData.modelFamily = model.family || ''
  }

  const id = await clientDB.chatSessions.add(baseData)
  return { ...baseData, id, count: 0 }
}
