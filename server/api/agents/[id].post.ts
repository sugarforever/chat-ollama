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

  const { instruction, prompt } = await readBody(event)
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
    for await (const chunk of responseStream) {
      const messages = chunk.messages
      const lastMessage = messages[messages.length - 1]
      yield lastMessage.content
    }
  })())

  return sendStream(event, readableStream)
})
