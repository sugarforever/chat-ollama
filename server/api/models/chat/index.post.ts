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
import { AIMessage, AIMessageChunk, AIMessageFields, BaseMessage, BaseMessageChunk, BaseMessageLike, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { resolveCoreference } from '~/server/coref'
import { concat } from "@langchain/core/utils/stream"
import { MODEL_FAMILIES } from '~/config'
import { McpService } from '@/server/utils/mcp'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ChatOllama } from '@langchain/ollama'
import { StructuredToolInterface, tool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

interface MessageContent {
  type: string
  text?: string
  image_url?: { url: string }
}

interface RequestBody {
  knowledgebaseId: number
  model: string
  family: string
  messages: {
    role: 'user' | 'assistant'
    content: string | MessageContent[]
    toolCallId?: string
    toolResult: boolean
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
  messages.map((message) => {
    if (Array.isArray(message.content)) {
      // For image messages, only include text parts
      const textParts = message.content
        .filter((part): part is MessageContent & { text: string } =>
          part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => part.text)
        .join(' ')
      return `${message.role}: ${textParts}`
    }
    return `${message.role}: ${message.content}`
  }).join("\n")

const transformMessages = (messages: RequestBody['messages']): BaseMessageLike[] =>
  messages.map((message) => {
    if (Array.isArray(message.content)) {
      // Handle array content format (text + images)
      return [message.role, message.content]
    }
    // Handle string content format
    return [message.role, message.content]
  })

const normalizeMessages = (messages: RequestBody['messages']): BaseMessage[] => {
  const normalizedMessages = []
  for (const message of messages) {
    if (message.toolResult) {
      normalizedMessages.push(new ToolMessage(message.content as string, message.toolCallId!))
    } else if (message.role === "user") {
      if (Array.isArray(message.content)) {
        normalizedMessages.push(new HumanMessage({ content: message.content }))
      } else {
        normalizedMessages.push(new HumanMessage(message.content))
      }
    } else if (message.role === "assistant") {
      normalizedMessages.push(new AIMessage(message.content as string))
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
    const query = (() => {
      const lastMessage = messages[messages.length - 1].content
      if (Array.isArray(lastMessage)) {
        return lastMessage
          .filter((part): part is MessageContent & { text: string } =>
            part.type === 'text' && typeof part.text === 'string'
          )
          .map(part => part.text)
          .join(' ')
      }
      return lastMessage
    })()
    console.log("User query: ", query)

    // const reformulatedResult = await resolveCoreference(query, normalizeMessages(messages), chat)
    const reformulatedQuery = query
    console.log("Reformulated query: ", reformulatedQuery)

    const relevant_docs = await retriever.invoke(reformulatedQuery)
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
          content: typeof response?.content === 'string' ? response.content : response?.content.toString(),
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
    let llm = createChatModel(model, family, event)

    const mcpService = new McpService()
    const normalizedTools = await mcpService.listTools()
    const toolsMap = normalizedTools.reduce((acc: Record<string, StructuredToolInterface>, tool) => {
      acc[tool.name] = tool
      return acc
    }, {})

    if (llm?.bindTools) {
      console.log("Binding tools to LLM")
      llm = llm.bindTools(normalizedTools) as BaseChatModel
    }

    if (!stream) {
      const response = await llm.invoke(transformMessages(messages))
      console.log(response)
      return {
        message: {
          role: 'assistant',
          content: typeof response?.content === 'string' ? response.content : response?.content.toString()
        }
      }
    }

    console.log("Streaming response")
    const transformedMessages = messages.map((message: RequestBody['messages'][number]) => {
      return [message.role, message.content]
    }) as BaseMessageLike[]
    const response = await llm?.stream(transformedMessages)

    console.log(response)

    const readableStream = Readable.from((async function* () {

      let gathered = undefined

      for await (const chunk of response) {
        gathered = gathered !== undefined ? concat(gathered, chunk) : chunk

        let content = chunk?.content

        // Handle array of text_delta objects
        if (Array.isArray(content)) {
          content = content
            .filter(item => item.type === 'text_delta')
            .map(item => item.text)
            .join('')
        }

        const message = {
          message: {
            role: 'assistant',
            content: content
          }
        }
        yield `${JSON.stringify(message)} \n\n`
      }

      const toolMessages = [] as ToolMessage[]
      console.log("Gathered response: ", gathered)
      for (const toolCall of gathered?.tool_calls ?? []) {
        console.log("Tool call: ", toolCall)
        const selectedTool = toolsMap[toolCall.name]

        if (selectedTool) {
          const result = await selectedTool.invoke(toolCall)

          console.log("Tool result: ", result)

          const message = {
            message: {
              role: "user",
              type: "tool_result",
              tool_use_id: result.tool_call_id,
              content: result.content
            }
          }

          toolMessages.push(new ToolMessage(result.content, result.tool_call_id))
          yield `${JSON.stringify(message)} \n\n`
        }
      }

      if (toolMessages.length) {
        transformedMessages.push(new AIMessage(gathered as AIMessageFields))
        transformedMessages.push(...toolMessages)
        const finalResponse = await llm.stream(transformedMessages as BaseMessageLike[])

        for await (const chunk of finalResponse) {
          let content = chunk?.content

          // Handle array of text_delta objects
          if (Array.isArray(content)) {
            content = content
              .filter((item): item is MessageContent & { type: 'text_delta'; text: string } =>
                item.type === 'text_delta' && 'text' in item)
              .map(item => item.text)
              .join('')
          }

          const message = {
            message: {
              role: 'assistant',
              content: content
            }
          }
          yield `${JSON.stringify(message)} \n\n`
        }
      }
    })())

    return sendStream(event, readableStream)
  }
})
