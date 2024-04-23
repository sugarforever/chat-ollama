-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KnowledgeBase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "embedding" TEXT,
    "description" TEXT,
    "created" DATETIME,
    "updated" DATETIME,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    CONSTRAINT "KnowledgeBase_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgeBase" ("created", "description", "embedding", "id", "name", "updated", "user_id") SELECT "created", "description", "embedding", "id", "name", "updated", "user_id" FROM "KnowledgeBase";
DROP TABLE "KnowledgeBase";
ALTER TABLE "new_KnowledgeBase" RENAME TO "KnowledgeBase";
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "KnowledgeBase"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
