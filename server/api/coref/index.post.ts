import { resolveCoreference } from '@/server/coref'
import { AIMessage, HumanMessage } from '@langchain/core/messages'

export default defineEventHandler(async (event) => {
  const { query, messages } = await readBody(event)
  const messagesList = []
  for (const message of messages) {
    if (message.role === "human") {
      messagesList.push(new HumanMessage(message.content))
    } else if (message.role === "ai") {
      messagesList.push(new AIMessage(message.content))
    }
  }

  let answer = { input: query, output: query }
  if (process.env.OPENAI_API_KEY) {
    answer = await resolveCoreference(
      query,
      messagesList,
      process.env.OPENAI_API_KEY)
  }

  return {
    answer
  }
})
