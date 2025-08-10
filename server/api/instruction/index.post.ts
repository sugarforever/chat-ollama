import prisma from "@/server/utils/prisma"

const saveInstructions = async (name: string, instruction: string, userId: number, isPublic: boolean = false) => {
  try {
    return await prisma.instruction.create({
      data: {
        name,
        instruction,
        user_id: userId,
        is_public: isPublic
      }
    })
  } catch (error) {
    console.error("Error saving instructions: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  // Require authentication for instruction creation
  if (!event.context.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required to create instructions'
    })
  }

  const { name, instruction, is_public = false } = await readBody(event)
  if (!name || !instruction) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and instruction are required'
    })
  }

  const result = await saveInstructions(name, instruction, event.context.user.id, is_public)
  return result
})
