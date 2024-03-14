import { type KnowledgeBase } from "@prisma/client";
import prisma from "@/server/utils/prisma";

const deleteKnowledgeBase = async (
  id?: string
): Promise<KnowledgeBase | null> => {
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
    console.error(`Error deleting knowledge base with id ${id}:`, error);
    return null;
  }
};

export default defineEventHandler(async (event) => {
  const id = event?.context?.params?.id;
  const deletedKnowledgeBase = await deleteKnowledgeBase(id);
  return { deletedKnowledgeBase };
});
