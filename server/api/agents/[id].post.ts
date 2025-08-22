import { StructuredTool } from '@langchain/core/tools'
import { createDeepAgent, CreateDeepAgentParams } from 'deepagents'
import { Readable } from 'stream'
import { McpService } from '~/server/utils/mcp'
import { createChatModel } from '~/server/utils/models'
import { MODEL_FAMILY_SEPARATOR } from '~/config'

const createAgent = (instruction: string, tools: StructuredTool[], model?: any) => {
    const agentConfig: CreateDeepAgentParams<any> = {
        tools: tools as any,
        instructions: instruction
    }

    // If a model is provided, add it to the agent configuration
    if (model) {
        agentConfig.model = model
    }

    const agent = createDeepAgent(agentConfig)
    return agent
}

export default defineEventHandler(async (event) => {
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

    const agent = createAgent(instruction, mcpTools as StructuredTool[], chatModel)

    const responseStream = await agent.stream({
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }, { streamMode: "values" })

    setEventStreamResponse(event)

    const readableStream = Readable.from((async function* () {
        // Use the conversation round ID to create a consistent AI message ID for this round
        const aiMessageId = `ai_${conversationRoundId}`
        let accumulatedAIContent = ''
        let aiMessageSent = false
        const toolMessages = new Map()

        for await (const chunk of responseStream) {
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
                        .map(item => typeof item === 'string' ? item : (item as any).text || '')
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
        }
    })())

    return sendStream(event, readableStream)
})
