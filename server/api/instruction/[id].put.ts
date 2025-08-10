import prisma from "@/server/utils/prisma"
import { requireInstruction, requireInstructionOwner } from "@/server/utils/instructions"

const updateInstructions = async (
    id: string,
    name: string,
    instruction: string,
    isPublic?: boolean
) => {
    try {
        const updateData: any = { name, instruction }
        if (isPublic !== undefined) {
            updateData.is_public = isPublic
        }

        return await prisma.instruction.update({
            where: { id: parseInt(id) },
            data: updateData
        })
    } catch (error) {
        console.error("Error editing instructions: ", error)
        return null
    }
}

export default defineEventHandler(async (event) => {
    const id = event?.context?.params?.id
    const { name, instruction, is_public } = await readBody(event)
    if (!id || !name || !instruction) {
        return
    }

    // Check if instruction exists and user has permission
    const existingInstruction = await requireInstruction(id)
    requireInstructionOwner(event, existingInstruction)

    const result = await updateInstructions(id, name, instruction, is_public)
    return result
})
