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
  enableToolUsage?: boolean
}

const SYSTEM_TEMPLATE = `Answer the user's question based on the context below.
Present your answer in a structured Markdown format.

If a tool is to be called, you should always review the tool call result, and user's question. You may need to call multiple tools to get the final answer.

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

const extractContentFromChunk = (chunk: BaseMessageChunk): { text: string; images: any[] } => {
  let content = chunk?.content
  let textContent = ''
  let images: any[] = []

  // Handle array content (multimodal)
  if (Array.isArray(content)) {
    // Extract text content
    textContent = content
      .filter(item => item.type === 'text_delta' || item.type === 'text')
      .map(item => ('text' in item ? item.text : ''))
      .join('')

    // Extract image content
    images = content
      .filter(item => item.type === 'image_url' && item.image_url?.url)
      .map(item => ({ type: 'image_url', image_url: item.image_url }))
  } else {
    // Handle string content
    textContent = content || ''
  }

  return { text: textContent, images }
}

const processToolCalls = async (
  toolCalls: any[],
  toolsMap: Record<string, StructuredToolInterface>,
  accumulatedToolCalls: any[],
  accumulatedToolResults: any[]
): Promise<ToolMessage[]> => {
  const toolMessages: ToolMessage[] = []

  for (const toolCall of toolCalls) {
    console.log("Processing tool call: ", toolCall)
    const selectedTool = toolsMap[toolCall.name]

    if (selectedTool) {
      // Add tool call info to tracking
      accumulatedToolCalls.push({
        id: toolCall.id,
        name: toolCall.name,
        args: toolCall.args
      })

      const result = await selectedTool.invoke(toolCall)
      console.log("Tool result: ", result)

      // Add tool result to tracking
      accumulatedToolResults.push({
        tool_call_id: toolCall.id, // Use the original tool call ID
        content: result.content
      })

      // Create ToolMessage with the correct tool_call_id from the original tool call
      toolMessages.push(new ToolMessage(result.content, toolCall.id))
    }
  }

  return toolMessages
}

const createMessageResponse = (content: string | MessageContent[], toolCalls: any[], toolResults: any[]) => ({
  message: {
    role: 'assistant',
    content,
    tool_calls: toolCalls,
    tool_results: toolResults
  }
})

const safeJsonStringify = (obj: any): string => {
  try {
    // Use JSON.stringify with proper escaping for newlines
    const jsonStr = JSON.stringify(obj, null, 0)
    // Ensure no unescaped newlines that could break the stream parsing
    return jsonStr.replace(/\r?\n/g, '\\n')
  } catch (error) {
    console.error('JSON stringify error:', error)
    // Fallback to a safe error message
    return JSON.stringify({ error: 'Failed to serialize message' })
  }
}

const handleMultiRoundToolCalls = async function* (
  llm: BaseChatModel,
  transformedMessages: BaseMessageLike[],
  toolsMap: Record<string, StructuredToolInterface>,
  initialGathered: any,
  initialContent: string,
  initialImages: any[],
  initialToolCalls: any[],
  initialToolResults: any[]
) {
  const MAX_ROUNDS = 10 // Prevent infinite loops
  let accumulatedTextContent = initialContent
  let accumulatedImages = [...initialImages]
  let accumulatedToolCalls = [...initialToolCalls]
  let accumulatedToolResults = [...initialToolResults]

  // Add initial AI message with tool calls to conversation
  if (initialGathered) {
    console.log("Adding initial AI message with tool_calls:", initialGathered?.tool_calls?.length || 0)
    transformedMessages.push(new AIMessage(initialGathered as AIMessageFields))
  }

  const initialToolMessages = await processToolCalls(
    initialGathered?.tool_calls ?? [],
    toolsMap,
    accumulatedToolCalls,
    accumulatedToolResults
  )

  console.log("Created initial tool messages:", initialToolMessages.length)

  // Create content for streaming - combine text and images if present
  let contentToStream: string | MessageContent[]
  if (accumulatedImages.length > 0) {
    const contentArray: MessageContent[] = []
    if (accumulatedTextContent) {
      contentArray.push({ type: 'text', text: accumulatedTextContent })
    }
    contentArray.push(...accumulatedImages)
    contentToStream = contentArray
  } else {
    contentToStream = accumulatedTextContent
  }
  
  // Stream initial tool results
  yield `${safeJsonStringify(createMessageResponse(contentToStream, accumulatedToolCalls, accumulatedToolResults))} \n\n`

  transformedMessages.push(...initialToolMessages)

  let hasMoreToolCalls = initialToolMessages.length > 0
  let roundCount = 0

  while (hasMoreToolCalls && roundCount < MAX_ROUNDS) {
    roundCount++
    console.log(`Tool call round ${roundCount}`)

    const nextResponse = await llm.stream(transformedMessages as BaseMessageLike[])
    let nextGathered = undefined
    let hasNewContent = false

    // Stream the response and gather potential new tool calls
    for await (const chunk of nextResponse) {
      nextGathered = nextGathered !== undefined ? concat(nextGathered, chunk) : chunk

      const { text, images } = extractContentFromChunk(chunk)
      if (text || images.length > 0) {
        if (text) {
          accumulatedTextContent += text
          hasNewContent = true
        }
        if (images.length > 0) {
          accumulatedImages.push(...images)
          hasNewContent = true
        }

        // Create content for streaming - combine text and images if present
        let contentToStream: string | MessageContent[]
        if (accumulatedImages.length > 0) {
          const contentArray: MessageContent[] = []
          if (accumulatedTextContent) {
            contentArray.push({ type: 'text', text: accumulatedTextContent })
          }
          contentArray.push(...accumulatedImages)
          contentToStream = contentArray
        } else {
          contentToStream = accumulatedTextContent
        }

        // Stream content updates immediately
        yield `${safeJsonStringify(createMessageResponse(contentToStream, accumulatedToolCalls, accumulatedToolResults))} \n\n`
      }
    }

    // Check if there are more tool calls to process
    const newToolCalls = nextGathered?.tool_calls ?? []
    if (newToolCalls.length > 0) {
      console.log(`Found ${newToolCalls.length} new tool calls in round ${roundCount}`)

      // Add the AI response to conversation if it had content or tool calls
      if (hasNewContent || newToolCalls.length > 0) {
        console.log(`Adding AI message for round ${roundCount} with tool_calls:`, newToolCalls.length)
        console.log("AI message tool_calls structure:", JSON.stringify(newToolCalls, null, 2))
        transformedMessages.push(new AIMessage(nextGathered as AIMessageFields))
      }

      // Process the new tool calls
      const newToolMessages = await processToolCalls(
        newToolCalls,
        toolsMap,
        accumulatedToolCalls,
        accumulatedToolResults
      )

      console.log(`Created ${newToolMessages.length} tool messages for round ${roundCount}`)
      console.log("Tool messages:", newToolMessages.map(tm => ({ content: tm.content, tool_call_id: tm.tool_call_id })))

      // Create content for streaming - combine text and images if present
      let contentToStream: string | MessageContent[]
      if (accumulatedImages.length > 0) {
        const contentArray: MessageContent[] = []
        if (accumulatedTextContent) {
          contentArray.push({ type: 'text', text: accumulatedTextContent })
        }
        contentArray.push(...accumulatedImages)
        contentToStream = contentArray
      } else {
        contentToStream = accumulatedTextContent
      }
      
      // Stream updated message with new tool calls and results
      yield `${safeJsonStringify(createMessageResponse(contentToStream, accumulatedToolCalls, accumulatedToolResults))} \n\n`

      // Add tool messages to conversation for next round
      transformedMessages.push(...newToolMessages)
      hasMoreToolCalls = newToolMessages.length > 0
    } else {
      hasMoreToolCalls = false
    }
  }

  if (roundCount >= MAX_ROUNDS) {
    console.warn(`Tool call processing stopped after ${MAX_ROUNDS} rounds to prevent infinite loops`)

    // Create a final AI response to summarize what was accomplished
    const finalResponse = await llm.stream([
      ...transformedMessages,
      new HumanMessage(`Based on all the tool calls and results above, please provide a comprehensive summary of what was accomplished and answer the original user question.`)
    ])

    try {
      // Stream the final AI response
      for await (const chunk of finalResponse) {
        const { text, images } = extractContentFromChunk(chunk)
        if (text || images.length > 0) {
          if (text) {
            accumulatedTextContent += text
          }
          if (images.length > 0) {
            accumulatedImages.push(...images)
          }

          // Create content for streaming - combine text and images if present
          let contentToStream: string | MessageContent[]
          if (accumulatedImages.length > 0) {
            const contentArray: MessageContent[] = []
            if (accumulatedTextContent) {
              contentArray.push({ type: 'text', text: accumulatedTextContent })
            }
            contentArray.push(...accumulatedImages)
            contentToStream = contentArray
          } else {
            contentToStream = accumulatedTextContent
          }

          // Stream the final message content
          yield `${safeJsonStringify(createMessageResponse(contentToStream, accumulatedToolCalls, accumulatedToolResults))} \n\n`
        }
      }
    } catch (error) {
      console.error('Error generating final summary:', error)
    }
  }
}

export default defineEventHandler(async (event) => {
  const { knowledgebaseId, model, family, messages, stream, enableToolUsage } = await readBody<RequestBody>(event)

  // Timeout optimization: Set streaming headers immediately
  if (stream) {
    setHeader(event, 'Content-Type', 'text/event-stream')
    setHeader(event, 'Cache-Control', 'no-cache')
    setHeader(event, 'Connection', 'keep-alive')
  }

  // Check if knowledge base feature is enabled
  if (knowledgebaseId && isKnowledgeBaseEnabled()) {
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
          yield `${safeJsonStringify(message)} \n\n`
        }
      }

      const docsChunk = {
        type: "relevant_documents",
        relevant_documents: rerankedDocuments
      }
      yield `${safeJsonStringify(docsChunk)} \n\n`
    })())
    return sendStream(event, readableStream)
  } else {
    let llm = createChatModel(model, family, event)

    const mcpService = new McpService()
    const normalizedTools = isMcpEnabled() && enableToolUsage ? await mcpService.listTools() : []
    console.log("Normalized tools: ", normalizedTools)
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
      let accumulatedTextContent = ''
      let accumulatedImages: any[] = []
      let toolCalls: any[] = []
      let toolResults: any[] = []

      // Stream initial response and gather tool calls
      for await (const chunk of response) {
        console.log("Streaming chunk: ", chunk)
        gathered = gathered !== undefined ? concat(gathered, chunk) : chunk

        const { text, images } = extractContentFromChunk(chunk)
        if (text || images.length > 0) {
          if (text) {
            accumulatedTextContent += text
          }
          if (images.length > 0) {
            accumulatedImages.push(...images)
          }

          // Create content for streaming - combine text and images if present
          let contentToStream: string | MessageContent[]
          if (accumulatedImages.length > 0) {
            const contentArray: MessageContent[] = []
            if (accumulatedTextContent) {
              contentArray.push({ type: 'text', text: accumulatedTextContent })
            }
            contentArray.push(...accumulatedImages)
            contentToStream = contentArray
          } else {
            contentToStream = accumulatedTextContent
          }

          // Stream content updates immediately to prevent timeout
          yield `${safeJsonStringify(createMessageResponse(contentToStream, toolCalls, toolResults))} \n\n`
        }
      }

      console.log("Gathered response: ", gathered)

      // Handle multi-round tool calls if any exist
      if (gathered?.tool_calls?.length > 0) {
        console.log("Starting multi-round tool call processing")
        yield* handleMultiRoundToolCalls(
          llm,
          transformedMessages,
          toolsMap,
          gathered,
          accumulatedTextContent,
          accumulatedImages,
          toolCalls,
          toolResults
        )
      }

      await mcpService.close()
    })())

    return sendStream(event, readableStream)
  }
})
