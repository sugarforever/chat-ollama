import { type Instruction } from "@prisma/client"
import prisma from "@/server/utils/prisma"

const listInstructions = async (): Promise<Instruction[] | null> => {
  try {
    return await prisma.instruction.findMany({
      orderBy: {
        id: 'desc'
      }
    })
  } catch (error) {
    console.error("Error fetching instructions: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  // Check if instructions feature is enabled
  if (!isInstructionsEnabled()) {
    setResponseStatus(event, 403, 'Instructions feature is disabled')
    return { error: 'Instructions feature is disabled' }
  }

  const instructions = await listInstructions()
  return { instructions }
})
