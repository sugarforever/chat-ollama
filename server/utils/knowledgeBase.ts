import { type H3Event } from 'h3'
import { KnowledgeBase } from '@prisma/client'

export const requireKnowledgeBase = async (knowledgeBaseId: string | undefined): Promise<KnowledgeBase> => {
  if (knowledgeBaseId == null) {
    throw createError({
      statusCode: 400,
      statusMessage: `Knowledge base id is required`
    })
  }

  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: {
      id: parseInt(knowledgeBaseId),
    },
  })

  if (knowledgeBase == null) {
    throw createError({
      statusCode: 404,
      statusMessage: `Knowledge base with id [${knowledgeBaseId}] not found`
    })
  }
  return knowledgeBase
}

export const requireKnowledgeBaseOwner = (event: H3Event, knowledgeBase: KnowledgeBase): void => {
  if (knowledgeBase.user_id != null && event.context.user?.id !== knowledgeBase.user_id) {
    throw createError({
      statusCode: 403,
      statusMessage: `You are not the owner of this knowledge base [${knowledgeBase.name}]`
    })
  }
}
