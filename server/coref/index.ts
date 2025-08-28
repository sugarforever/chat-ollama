import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { BaseMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '~/server/models/openai'
import { JsonOutputParser } from "@langchain/core/output_parsers"
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

const PROMPT = `
Given a chat history and the latest user question which might reference context in the chat history, formulate a standalone question which can be understood without the chat history.
Do NOT answer the question, just reformulate it if needed and otherwise return it as is.

Respond with the following JSON format:

{{
  "input": "What is its capital?",
  "output": "What is the capital of France?"
}}
`
const CoreferenceResolutionPrompt = ChatPromptTemplate.fromMessages([
  ["system", PROMPT],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"]
])

export type CorefResult = {
  input: string
  output: string
}

export const resolveCoreference = async (
  userInput: string,
  chatHistory: BaseMessage[],
  chatModel: BaseChatModel
): Promise<CorefResult> => {
  if (chatModel !== undefined) {
    const prompt = await CoreferenceResolutionPrompt.format({
      chat_history: chatHistory,
      input: userInput
    })
    return await chatModel.pipe(new JsonOutputParser<CorefResult>()).invoke(prompt)
  } else {
    return {
      input: userInput,
      output: userInput
    }
  }
}
