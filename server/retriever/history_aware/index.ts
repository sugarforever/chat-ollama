import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever"
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { LanguageModelLike } from '@langchain/core/language_models/base'
import { DocumentInterface } from '@langchain/core/documents'
import { RunnableInterface } from '@langchain/core/runnables'

const historyAwarePrompt = ChatPromptTemplate.fromMessages([
  new MessagesPlaceholder("chat_history"),
  ["user", "{input}"],
  [
    "user",
    "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation",
  ],
])

const initHistoryAwareRetriever = async (llm: LanguageModelLike,
  retriever: RunnableInterface<string, DocumentInterface[]>) => {
  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  })

  return historyAwareRetrieverChain
}

