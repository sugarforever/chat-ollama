import type { KnowledgeBase } from '@prisma/client'
import prisma from '@/server/utils/prisma'

const listKnowledgeBases = async (userId: number | null): Promise<KnowledgeBase[] | null> => {
  try {
    const whereClause = (userId !== null && userId !== undefined) ?
      {
        OR: [
          { user_id: userId },
          { user_id: null },
          { is_public: true }
        ]
      }
      : {
        OR: [
          { user_id: null },
          { is_public: true }
        ]
      }

    return await prisma.knowledgeBase.findMany({
      where: whereClause,
      orderBy: {
        id: 'desc'
      },
      include: {
        files: true
      }
    })
  } catch (error) {
    console.error("Error fetching knowledge bases: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  const knowledgeBases = await listKnowledgeBases(event.context.user?.id)
  return { knowledgeBases }
})
