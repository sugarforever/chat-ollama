import { PrismaClient } from "@prisma/client";

const deleteInstructions = async (id: string) => {
  const prisma = new PrismaClient();

  try {
    return await prisma.instruction.delete({
      where: { id: parseInt(id) },
    });
  } catch (error) {
    console.error("Error delete instructions: ", error);
    return null;
  }
};

export default defineEventHandler(async (event) => {
  const id = event?.context?.params?.id;
  if (!id) return;

  const result = await deleteInstructions(id);
  return result;
});
