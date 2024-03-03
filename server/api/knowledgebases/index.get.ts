import { PrismaClient, type KnowledgeBase } from '@prisma/client';

const listKnowledgeBases = async (): Promise<KnowledgeBase[] | null> => {
  const prisma = new PrismaClient();
  try {
    return await prisma.knowledgeBase.findMany();
  } catch (error) {
    console.error("Error fetching knowledge bases: ", error);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const knowledgeBases = await listKnowledgeBases();
  return { knowledgeBases };
})
