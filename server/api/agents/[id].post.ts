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
        const toolCallId = lastMessage.tool_call_id || `tool_${Date.now()}`
        
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
