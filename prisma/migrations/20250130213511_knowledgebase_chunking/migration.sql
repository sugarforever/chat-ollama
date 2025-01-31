-- AlterTable
ALTER TABLE "KnowledgeBase" ADD COLUMN "childChunkOverlap" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "childChunkSize" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "childK" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "parentChunkOverlap" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "parentChunkSize" INTEGER;
ALTER TABLE "KnowledgeBase" ADD COLUMN "parentK" INTEGER;
