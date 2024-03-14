import { type KnowledgeBase } from '@prisma/client';
import prisma from '@/server/utils/prisma';

const listKnowledgeBases = async (): Promise<KnowledgeBase[] | null> => {
  try {
    return await prisma.knowledgeBase.findMany({
      include: {
        files: true
      }
    });
  } catch (error) {
    console.error("Error fetching knowledge bases: ", error);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const knowledgeBases = await listKnowledgeBases();
  return { knowledgeBases };
})
