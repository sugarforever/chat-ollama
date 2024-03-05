/*
  Warnings:

  - You are about to drop the column `filename` on the `KnowledgeBase` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "KnowledgeBaseFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "knowledgeBaseId" INTEGER NOT NULL,
    CONSTRAINT "KnowledgeBaseFile_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgeBase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "embedding" TEXT,
    "description" TEXT,
    "created" DATETIME,
    "updated" DATETIME
);
INSERT INTO "new_KnowledgeBase" ("created", "description", "embedding", "id", "name", "updated") SELECT "created", "description", "embedding", "id", "name", "updated" FROM "KnowledgeBase";
DROP TABLE "KnowledgeBase";
ALTER TABLE "new_KnowledgeBase" RENAME TO "KnowledgeBase";
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "KnowledgeBase"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
