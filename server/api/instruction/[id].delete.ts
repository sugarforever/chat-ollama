import prisma from "@/server/utils/prisma";

const deleteInstructions = async (id: string) => {
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
