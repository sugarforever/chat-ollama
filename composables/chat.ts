interface ChatSessionBaseData extends Omit<ChatSession, 'id'> { }

export function useCreateChatSession() {
  const { chatModels, loadModels } = useModels({ immediate: false })
  const { t } = useI18n()
  const toast = useToast()

  return async function createChatSession(params?: Partial<Omit<ChatSessionBaseData, 'attachedMessagesCount' | 'createTime' | 'updateTime'>>) {
    const baseData: ChatSessionBaseData = {
      createTime: Date.now(),
      updateTime: Date.now(),
      title: params?.title || '',
      model: params?.model || chatDefaultSettings.value.model[0],
      modelFamily: params?.modelFamily || '',
      instructionId: params?.instructionId || 0,
      knowledgeBaseId: params?.knowledgeBaseId || 0,
      attachedMessagesCount: chatDefaultSettings.value.attachedMessagesCount,
      isTop: 0,
    }

    // set default model
    await loadModels()
    if (chatModels.value.length === 0) {
      toast.add({ title: t('chat.noModelFound'), description: t('chat.noModelFoundDesc'), color: 'red' })
    } else {
      const model = chatModels.value.find(m => m.value === baseData.model) || chatModels.value[0]
      baseData.model = model.value
      baseData.modelFamily = model.family || ''
    }

    const id = await clientDB.chatSessions.add(baseData)
    return { ...baseData, id, count: 0 }
  }
}
