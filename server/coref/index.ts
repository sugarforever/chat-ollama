import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { BaseMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { JsonOutputParser } from "@langchain/core/output_parsers"

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
  openAIApiKey: string | undefined,
): Promise<CorefResult> => {
  if (openAIApiKey?.length ?? 0 > 0) {
    const prompt = await CoreferenceResolutionPrompt.format({
      chat_history: chatHistory,
      input: userInput
    })
    const llm = new ChatOpenAI({
      openAIApiKey,
      modelName: "gpt-4o"
    })
    const chain = llm.pipe(new JsonOutputParser<CorefResult>())
    return await chain.invoke(prompt)
  } else {
    return {
      input: userInput,
      output: userInput
    }
  }
}
