-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgeBaseFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "knowledgeBaseId" INTEGER NOT NULL,
    CONSTRAINT "KnowledgeBaseFile_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgeBaseFile" ("id", "knowledgeBaseId", "url") SELECT "id", "knowledgeBaseId", "url" FROM "KnowledgeBaseFile";
DROP TABLE "KnowledgeBaseFile";
ALTER TABLE "new_KnowledgeBaseFile" RENAME TO "KnowledgeBaseFile";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
