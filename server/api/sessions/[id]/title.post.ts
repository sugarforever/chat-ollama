import { createChatModel } from '@/server/utils/models'

interface RequestBody {
  model: string
  family: string
  userMessage: string
  systemPrompt?: string
  maxWords?: number
  style?: 'concise' | 'descriptive' | 'technical' | 'casual'
}

const TITLE_PROMPTS = {
  concise: (maxWords: number) => `Generate a ${maxWords}-word title for this chat. Respond with only the title.`,
  descriptive: (maxWords: number) => `Generate a descriptive ${maxWords}-word title that captures the main topic of this chat. Respond with only the title.`,
  technical: (maxWords: number) => `Generate a technical ${maxWords}-word title focusing on the specific subject matter. Respond with only the title.`,
  casual: (maxWords: number) => `Generate a casual, friendly ${maxWords}-word title for this chat. Respond with only the title.`
}

export default defineEventHandler(async (event) => {
  const { 
    model, 
    family, 
    userMessage, 
    systemPrompt,
    maxWords = 6,
    style = 'concise'
  } = await readBody<RequestBody>(event)
  
  // Create the same chat model as the regular chat endpoint
  const llm = createChatModel(model, family, event)
  
  // Use custom prompt or generate based on style
  const prompt = systemPrompt || TITLE_PROMPTS[style](maxWords)
  
  const response = await llm.invoke([
    ['system', prompt],
    ['user', userMessage]
  ])
  
  return {
    title: typeof response?.content === 'string' ? response.content.trim() : response?.content.toString().trim()
  }
})