import { PrismaClient, type Instruction } from "@prisma/client";

const listInstructions = async (): Promise<Instruction[] | null> => {
  const prisma = new PrismaClient();
  try {
    return await prisma.instruction.findMany({});
  } catch (error) {
    console.error("Error fetching instructions: ", error);
    return [];
  }
};

export default defineEventHandler(async (event) => {
  const instructions = await listInstructions();
  return { instructions };
});
