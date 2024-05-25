import { Readable } from 'stream'
import { formatDocumentsAsString } from "langchain/util/document"
import { PromptTemplate } from "@langchain/core/prompts"
import { RunnableSequence } from "@langchain/core/runnables"
// import { CohereRerank } from "@langchain/cohere"
import { CohereRerank } from "@/server/rerank/cohere"
import { setEventStreamResponse } from '@/server/utils'
import { BaseRetriever } from "@langchain/core/retrievers"
import prisma from "@/server/utils/prisma"
import { createChatModel, createEmbeddings } from '@/server/utils/models'
import { createRetriever } from '@/server/retriever'
import { AIMessage, BaseMessage, BaseMessageLike, HumanMessage } from '@langchain/core/messages'
import { resolveCoreference } from '~/server/coref'

interface RequestBody {
  knowledgebaseId: number
  model: string
  family: string
  messages: {
    role: 'user' | 'assistant'
    content: string
  }[]
  stream: any
}

const SYSTEM_TEMPLATE = `Answer the user's question based on the context below.
Present your answer in a structured Markdown format.

If the context doesn't contain any relevant information to the question, don't make something up and just say "I don't know":

<context>
{context}
</context>

<chat_history>
{chatHistory}
</chat_history>

<question>
{question}
</question>

Answer:
`

const serializeMessages = (messages: RequestBody['messages']): string =>
  messages.map((message) => `${message.role}: ${message.content}`).join("\n")

const transformMessages = (messages: RequestBody['messages']): BaseMessageLike[] =>
  messages.map((message) => [message.role, message.content])

const normalizeMessages = (messages: RequestBody['messages']): BaseMessage[] => {
  const normalizedMessages = []
  for (const message of messages) {
    if (message.role === "user") {
      normalizedMessages.push(new HumanMessage(message.content))
    } else if (message.role === "assistant") {
      normalizedMessages.push(new AIMessage(message.content))
    }
  }

  return normalizedMessages
}

export default defineEventHandler(async (event) => {
  const { knowledgebaseId, model, family, messages, stream } = await readBody<RequestBody>(event)

  if (knowledgebaseId) {
    console.log("Chat with knowledge base with id: ", knowledgebaseId)
    const knowledgebase = await prisma.knowledgeBase.findUnique({
      where: {
        id: knowledgebaseId,
      },
    })
    console.log(`Knowledge base ${knowledgebase?.name} with embedding "${knowledgebase?.embedding}"`)
    if (!knowledgebase) {
      setResponseStatus(event, 404, `Knowledge base with id ${knowledgebaseId} not found`)
      return
    }

    const embeddings = createEmbeddings(knowledgebase.embedding!, event)
    const retriever: BaseRetriever = await createRetriever(embeddings, `collection_${knowledgebase.id}`)

    const chat = createChatModel(model, family, event)
    const query = messages[messages.length - 1].content
    console.log("User query: ", query)

    const reformulatedResult = await resolveCoreference(
      query,
      normalizeMessages(messages),
      process.env.OPENAI_API_KEY
    )
    const reformulatedQuery = reformulatedResult.output || query
    console.log("Reformulated query: ", reformulatedQuery)

    const relevant_docs = await retriever.getRelevantDocuments(reformulatedQuery)
    console.log("Relevant documents: ", relevant_docs)

    let rerankedDocuments = relevant_docs

    if ((process.env.COHERE_API_KEY || process.env.COHERE_BASE_URL) && process.env.COHERE_MODEL) {
      const options = {
        apiKey: process.env.COHERE_API_KEY,
        baseUrl: process.env.COHERE_BASE_URL,
        model: process.env.COHERE_MODEL,
        topN: 4
      }
      console.log("Cohere Rerank Options: ", options)
      const cohereRerank = new CohereRerank(options)
      rerankedDocuments = await cohereRerank.compressDocuments(relevant_docs, reformulatedQuery)
      console.log("Cohere reranked documents: ", rerankedDocuments)
    }

    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) =>
          input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) =>
          input.chatHistory ?? "",
        context: async () => {
          return formatDocumentsAsString(rerankedDocuments)
        },
      },
      PromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
      chat
    ])

    if (!stream) {
      const response = await chain.invoke({
        question: query,
        chatHistory: serializeMessages(messages),
      })

      return {
        message: {
          role: 'assistant',
          content: response?.content,
          relevant_docs
        }
      }
    }

    setEventStreamResponse(event)
    const response = await chain.stream({
      question: query,
      chatHistory: serializeMessages(messages),
    })

    const readableStream = Readable.from((async function* () {
      for await (const chunk of response) {
        if (chunk?.content !== undefined) {
          const message = {
            message: {
              role: 'assistant',
              content: chunk?.content
            }
          }
          yield `${JSON.stringify(message)} \n\n`
        }
      }

      const docsChunk = {
        type: "relevant_documents",
        relevant_documents: rerankedDocuments
      }
      yield `${JSON.stringify(docsChunk)} \n\n`
    })())
    return sendStream(event, readableStream)
  } else {
    const llm = createChatModel(model, family, event)

    if (!stream) {
      const response = await llm.invoke(transformMessages(messages))

      return {
        message: {
          role: 'assistant',
          content: response?.content
        }
      }
    }

    const response = await llm?.stream(messages.map((message: RequestBody['messages'][number]) => {
      return [message.role, message.content]
    }))

    const readableStream = Readable.from((async function* () {
      for await (const chunk of response) {
        const message = {
          message: {
            role: 'assistant',
            content: chunk?.content
          }
        }
        yield `${JSON.stringify(message)} \n\n`
      }
    })())

    return sendStream(event, readableStream)
  }
})
