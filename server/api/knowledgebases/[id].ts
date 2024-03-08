import { PrismaClient, type KnowledgeBase } from "@prisma/client";

const listKnowledgeBase = async (
  id?: string
): Promise<KnowledgeBase | null> => {
  const prisma = new PrismaClient();
  try {
    let knowledgeBase = null;

    if (id) {
      knowledgeBase = await prisma.knowledgeBase.findUnique({
        where: {
          id: parseInt(id),
        },
      });
    }

    return knowledgeBase;
  } catch (error) {
    console.error(`Error fetching knowledge base with id ${id}:`, error);
    return null;
  }
};

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
  switch (event.method) {
    case "GET":
      const knowledgeBase = await listKnowledgeBase(id);
      return { knowledgeBase };
    case "DELETE":
      const deletedKnowledgeBase = await deleteKnowledgeBase(id);
      return { deletedKnowledgeBase };
    default:
      return { message: "Method not allowed" };
  }
});
