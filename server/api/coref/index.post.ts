import { resolveCoreference } from '@/server/coref'
import { AIMessage, HumanMessage } from '@langchain/core/messages'

export default defineEventHandler(async (event) => {
  const { model, family, query, messages } = await readBody(event)
  const messagesList = []
  for (const message of messages) {
    if (message.role === "human") {
      messagesList.push(new HumanMessage(message.content))
    } else if (message.role === "ai") {
      messagesList.push(new AIMessage(message.content))
    }
  }
  const chat = createChatModel(model, family, event)
  const answer = await resolveCoreference(
    query,
    messagesList,
    chat)
  return {
    answer
  }
})
