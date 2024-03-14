import { type Instruction } from "@prisma/client";
import prisma from "@/server/utils/prisma";

const listInstructions = async (): Promise<Instruction[]> => {
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
