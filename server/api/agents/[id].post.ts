import { StructuredTool } from '@langchain/core/tools'
import { createDeepAgent } from 'deepagents'
import { Readable } from 'stream'
import { McpService } from '~/server/utils/mcp'
import { createChatModel } from '~/server/utils/models'
import { MODEL_FAMILY_SEPARATOR } from '~/config'

const createAgent = (instruction: string, tools: StructuredTool[], model?: any) => {
  const agentConfig: any = {
    tools: tools,
    instructions: instruction,
    // Increase recursion limit to prevent the error
    recursionLimit: 50
  }

  // If a model is provided, add it to the agent configuration
  if (model) {
    agentConfig.model = model
  }

  const agent = createDeepAgent(agentConfig)
  return agent
}

export default defineEventHandler(async (event) => {
  try {
    // Require authentication for instruction creation
    /*
    if (!event.context.user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required to create instructions'
      })
    }
    */
    const mcpService = new McpService()
    const mcpTools = await mcpService.listTools()
    console.log("MCP tools: ", mcpTools)

    const { instruction, prompt, conversationRoundId, models } = await readBody(event)

    // Validate required parameters
    if (!instruction || !prompt || !conversationRoundId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required parameters: instruction, prompt, or conversationRoundId'
      })
    }
    // Create chat model if models are provided
    let chatModel
    if (models && models.length > 0) {
      // Use the first model from the selection
      const modelValue = models[0]
      const [family, modelName] = modelValue.split(MODEL_FAMILY_SEPARATOR)

      try {
        chatModel = createChatModel(modelName, family, event)
        console.log(`Using model: ${family}/${modelName} for deep agent`)
      } catch (error) {
        console.warn(`Failed to create model ${modelValue}, falling back to default:`, error)
      }
    }

    let agent, responseStream

    try {
      agent = createAgent(instruction, mcpTools as StructuredTool[], chatModel)

      responseStream = await agent.stream({
        "messages": [
          {
            "role": "user",
            "content": prompt
          }
        ]
      }, { streamMode: "values" })
    } catch (agentError: any) {
      // Handle errors during agent creation or stream initialization
      console.error('Agent creation/stream initialization error:', agentError)
      console.log('Sending error message to client:', errorMessage)

      // Format error message based on error type
      let errorMessage = 'Agent initialization failed'
      if (agentError.message?.includes('Recursion limit')) {
        errorMessage = 'The agent reached its maximum planning steps. This usually happens with very complex tasks. Please try breaking down your request into smaller, more specific tasks.'
      } else if (agentError.message?.includes('GRAPH_RECURSION_LIMIT')) {
        errorMessage = 'The agent exceeded the maximum number of reasoning steps. Please try a simpler request or break it into smaller parts.'
      } else if (agentError.message) {
        errorMessage = `Agent error: ${agentError.message}`
      }

      setEventStreamResponse(event)

      const errorStream = Readable.from((async function* () {
        const errorData = {
          id: `error_${conversationRoundId}`,
          type: 'error',
          content: errorMessage,
          conversationRoundId: conversationRoundId,
          timestamp: Date.now()
        }
        yield JSON.stringify(errorData) + '\n'

        const completionData = {
          id: `complete_${conversationRoundId}`,
          type: 'complete',
          content: 'Completed with errors',
          conversationRoundId: conversationRoundId,
          timestamp: Date.now()
        }
        yield JSON.stringify(completionData) + '\n'
      })())

      return sendStream(event, errorStream)
    }

    setEventStreamResponse(event)

    const readableStream = Readable.from((async function* () {
      // Use the conversation round ID to create a consistent AI message ID for this round
      const aiMessageId = `ai_${conversationRoundId}`
      let accumulatedAIContent = ''
      let aiMessageSent = false
      const toolMessages = new Map()
      let hasError = false

      try {
        for await (const chunk of responseStream) {
          try {
            const messages = chunk.messages
            const lastMessage = messages[messages.length - 1]

            console.log("Message: ", lastMessage)

            const messageType = lastMessage._getType ? lastMessage._getType() : 'ai'

            if (messageType === 'ai') {
              // Process AI messages - extract and accumulate text content
              let textContent = ''

              if (Array.isArray(lastMessage.content)) {
                // Extract text from array content
                textContent = lastMessage.content
                  .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type === 'text'))
                  .map(item => typeof item === 'string' ? item : item.text || '')
                  .join(' ')
              } else if (typeof lastMessage.content === 'string') {
                textContent = lastMessage.content
              } else {
                textContent = String(lastMessage.content || '')
              }

              // Only update if we have more content than before
              if (textContent.length > accumulatedAIContent.length) {
                accumulatedAIContent = textContent

                const messageData = {
                  id: aiMessageId,
                  type: 'ai',
                  content: accumulatedAIContent,
                  conversationRoundId: conversationRoundId,
                  timestamp: Date.now(),
                  isUpdate: aiMessageSent // true if this is an update to existing message
                }

                aiMessageSent = true
                yield JSON.stringify(messageData) + '\n'
              }

            } else if (messageType === 'tool') {
              // Process tool messages - send once per unique tool call
              const toolCallId = (lastMessage as any).tool_call_id || `tool_${Date.now()}`

              if (!toolMessages.has(toolCallId)) {
                let toolContent = lastMessage.content

                // Process tool content to make it more readable
                if (Array.isArray(toolContent)) {
                  toolContent = toolContent
                    .map(item => typeof item === 'string' ? item : JSON.stringify(item, null, 2))
                    .join('\n')
                } else if (typeof toolContent === 'object') {
                  toolContent = JSON.stringify(toolContent, null, 2)
                } else {
                  toolContent = String(toolContent || '')
                }

                const messageData = {
                  id: toolCallId,
                  type: 'tool',
                  content: toolContent,
                  name: lastMessage.name || 'Tool',
                  tool_call_id: toolCallId,
                  conversationRoundId: conversationRoundId,
                  timestamp: Date.now()
                }

                toolMessages.set(toolCallId, messageData)
                yield JSON.stringify(messageData) + '\n'
              }
            }
          } catch (chunkError) {
            console.error('Error processing chunk:', chunkError)
            hasError = true
            // Send error message to client but continue processing
            const errorData = {
              id: `error_${Date.now()}`,
              type: 'error',
              content: `Chunk processing error: ${chunkError.message}`,
              conversationRoundId: conversationRoundId,
              timestamp: Date.now()
            }
            yield JSON.stringify(errorData) + '\n'
          }
        }
      } catch (streamError) {
        console.error('Error in stream processing:', streamError)
        hasError = true

        // Send error message to client
        const errorData = {
          id: `error_${conversationRoundId}`,
          type: 'error',
          content: `Stream processing error: ${streamError.message}`,
          conversationRoundId: conversationRoundId,
          timestamp: Date.now()
        }
        yield JSON.stringify(errorData) + '\n'
      } finally {
        // Always send completion signal
        const completionData = {
          id: `complete_${conversationRoundId}`,
          type: 'complete',
          content: hasError ? 'Completed with errors' : 'Completed successfully',
          conversationRoundId: conversationRoundId,
          timestamp: Date.now()
        }
        yield JSON.stringify(completionData) + '\n'
      }
    })())

    return sendStream(event, readableStream)

  } catch (error: any) {
    console.error('Agent API Error:', error)

    // If we haven't started streaming yet, we can send a proper HTTP error response
    if (!event.node.res.headersSent) {
      throw createError({
        statusCode: error.statusCode || 500,
        statusMessage: error.statusMessage || error.message || 'Internal server error'
      })
    }

    // If streaming has already started, we need to send an error in the stream format
    setEventStreamResponse(event)
    const conversationRoundId = 'error'

    const errorStream = Readable.from((async function* () {
      const errorData = {
        id: `error_${Date.now()}`,
        type: 'error',
        content: error.message || 'An unexpected error occurred',
        conversationRoundId: conversationRoundId,
        timestamp: Date.now()
      }
      yield JSON.stringify(errorData) + '\n'

      const completionData = {
        id: `complete_${Date.now()}`,
        type: 'complete',
        content: 'Completed with errors',
        conversationRoundId: conversationRoundId,
        timestamp: Date.now()
      }
      yield JSON.stringify(completionData) + '\n'
    })())

    return sendStream(event, errorStream)
  }
})
