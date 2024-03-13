import prisma from "@/server/utils/prisma";

const updateInstructions = async (
  id: string,
  name: string,
  instruction: string
) => {
  try {
    return await prisma.instruction.upsert({
      where: { id: parseInt(id) },
      update: { name, instruction },
      create: {
        name,
        instruction,
      },
    });
  } catch (error) {
    console.error("Error editing instructions: ", error);
    return null;
  }
};

export default defineEventHandler(async (event) => {
  const id = event?.context?.params?.id;
  const { name, instruction } = await readBody(event);
  if (!id || !name || !instruction) {
    return;
  }

  const result = await updateInstructions(id, name, instruction);
  return result;
});
