import { PrismaClient, type KnowledgeBase } from "@prisma/client";

const deleteKnowledgeBase = async (
  id?: string
): Promise<KnowledgeBase | null> => {
  const prisma = new PrismaClient();
  try {
    let deletedKnowledgeBase = null;
    if (id) {
      deletedKnowledgeBase = await prisma.knowledgeBase.delete({
        where: {
          id: parseInt(id),
        },
      });
    }

    return deletedKnowledgeBase;
  } catch (error) {
    console.error(`Error fetching knowledge base with id ${id}:`, error);
    return null;
  }
};

export default defineEventHandler(async (event) => {
  const id = event?.context?.params?.id;
  const deletedKnowledgeBase = await deleteKnowledgeBase(id);
  return { deletedKnowledgeBase };
});
