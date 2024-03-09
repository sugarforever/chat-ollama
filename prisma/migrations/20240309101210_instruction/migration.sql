-- CreateTable
CREATE TABLE "Instruction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "instruction" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Instruction_name_key" ON "Instruction"("name");
