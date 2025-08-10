import { type Instruction } from "@prisma/client"
import prisma from "@/server/utils/prisma"

const listInstructions = async (userId: number | null): Promise<Instruction[] | null> => {
  try {
    const whereClause = (userId !== null && userId !== undefined) ?
      {
        OR: [
          { user_id: userId },
          { is_public: true }
        ]
      }
      : {
        is_public: true
      }

    return await prisma.instruction.findMany({
      where: whereClause,
      orderBy: {
        id: 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
  } catch (error) {
    console.error("Error fetching instructions: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  const instructions = await listInstructions(event.context.user?.id)
  return { instructions }
})
