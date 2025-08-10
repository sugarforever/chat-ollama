import type { Instruction } from '@prisma/client'
import prisma from '@/server/utils/prisma'

/**
 * Server-side utility to check if instructions feature is enabled
 */
export function isInstructionsEnabled(): boolean {
    const config = useRuntimeConfig()
    return config.instructionsEnabled
}

/**
 * Require an instruction to exist and return it
 */
export async function requireInstruction(id?: string): Promise<Instruction> {
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Instruction ID is required'
    })
  }

  const instruction = await prisma.instruction.findUnique({
    where: { id: parseInt(id) }
  })

  if (!instruction) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Instruction not found'
    })
  }

  return instruction
}

/**
 * Require the current user to be the owner of the instruction (or it's a system instruction they can view)
 */
export function requireInstructionOwner(event: any, instruction: Instruction): void {
  const currentUser = event.context.user

  // System instructions cannot be modified by users
  if (instruction.is_system) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cannot modify system instructions'
    })
  }

  // If instruction has no owner (user_id is null), it's a legacy instruction - only allow modification if user is authenticated
  if (instruction.user_id === null) {
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      })
    }
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
  if (instruction.user_id !== currentUser.id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied: You are not the owner of this instruction'
    })
  }
}
