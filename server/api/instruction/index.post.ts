import prisma from "@/server/utils/prisma"

const saveInstructions = async (name: string, instruction: string, userId?: number, isPublic: boolean = false) => {
  try {
    return await prisma.instruction.create({ 
      data: { 
        name, 
        instruction,
        user_id: userId || null,
        is_system: false,
        is_public: isPublic
      } 
    })
  } catch (error) {
    console.error("Error saving instructions: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  // Check if instructions feature is enabled
  if (!isInstructionsEnabled()) {
    setResponseStatus(event, 403, 'Instructions feature is disabled')
    return { error: 'Instructions feature is disabled' }
  }

  const { name, instruction, is_public = false } = await readBody(event)
  if (!name || !instruction) {
    return
  }
  
  const result = await saveInstructions(name, instruction, event.context.user?.id, is_public)
  return result
})
