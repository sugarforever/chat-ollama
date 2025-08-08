import type { KnowledgeBase } from '@prisma/client'
import prisma from '@/server/utils/prisma'

/**
 * Server-side utility to check if knowledge base feature is enabled
 */
export function isKnowledgeBaseEnabled(): boolean {
  const config = useRuntimeConfig()
  return config.knowledgeBaseEnabled
}

/**
 * Require a knowledge base to exist and return it
 */
export async function requireKnowledgeBase(id?: string): Promise<KnowledgeBase> {
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Knowledge base ID is required'
    })
  }

  const knowledgeBase = await prisma.knowledgeBase.findUnique({
    where: { id: parseInt(id) }
  })

  if (!knowledgeBase) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Knowledge base not found'
    })
  }

  return knowledgeBase
}

/**
 * Require the current user to be the owner of the knowledge base
 */
export function requireKnowledgeBaseOwner(event: any, knowledgeBase: KnowledgeBase): void {
  const currentUser = event.context.user

  // If knowledge base has no owner (user_id is null), it's accessible to all
  if (knowledgeBase.user_id === null) {
    return
  }

  // If user is not authenticated
  if (!currentUser) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }

  // If user is not the owner
  if (knowledgeBase.user_id !== currentUser.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: You are not the owner of this knowledge base'
    })
  }
}
