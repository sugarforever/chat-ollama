-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Instruction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "user_id" INTEGER,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Instruction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Instruction" ("id", "instruction", "name") SELECT "id", "instruction", "name" FROM "Instruction";
DROP TABLE "Instruction";
ALTER TABLE "new_Instruction" RENAME TO "Instruction";
CREATE UNIQUE INDEX "Instruction_name_key" ON "Instruction"("name");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
