import { StructuredTool } from '@langchain/core/tools'
import { createDeepAgent } from 'deepagents'
import { Readable } from 'stream'
import { McpService } from '~/server/utils/mcp'

const createAgent = (instruction: string, tools: StructuredTool[]) => {
  const agent = createDeepAgent({
    tools: tools,
    instructions: instruction
  })

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

  const { instruction, prompt, conversationRoundId } = await readBody(event)
  const agent = createAgent(instruction, mcpTools as StructuredTool[])

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
    
    for await (const chunk of responseStream) {
      const messages = chunk.messages
      const lastMessage = messages[messages.length - 1]

      console.log("Message: ", lastMessage)

      const messageType = lastMessage._getType ? lastMessage._getType() : 'ai'
      
      // For AI messages, use the conversation round ID to group all AI responses in this round
      let messageId = lastMessage.id
      if (messageType === 'ai') {
        messageId = aiMessageId
      }

      // Create structured message data
      const messageData = {
        id: messageId || Date.now(),
        type: messageType, // HumanMessage, AIMessage, ToolMessage
        content: lastMessage.content,
        name: lastMessage.name || undefined, // For tool messages
        tool_call_id: lastMessage.tool_call_id || undefined, // For tool messages
        additional_kwargs: lastMessage.additional_kwargs || undefined,
        conversationRoundId: conversationRoundId,
        timestamp: Date.now()
      }

      // Convert to JSON string for streaming
      yield JSON.stringify(messageData) + '\n'
    }
  })())

  return sendStream(event, readableStream)
})
