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
  const instructions = await listInstructions()
  return { instructions }
})
