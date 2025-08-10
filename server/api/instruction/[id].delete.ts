import prisma from "@/server/utils/prisma"
import { requireInstruction, requireInstructionOwner } from "@/server/utils/instructions"

const deleteInstructions = async (id: string) => {
  try {
    return await prisma.instruction.delete({
      where: { id: parseInt(id) },
    })
  } catch (error) {
    console.error("Error delete instructions: ", error)
    return null
  }
}

export default defineEventHandler(async (event) => {
  const id = event?.context?.params?.id
  if (!id) return

  // Check if instruction exists and user has permission
  const existingInstruction = await requireInstruction(id)
  requireInstructionOwner(event, existingInstruction)

  const result = await deleteInstructions(id)
  return result
})
