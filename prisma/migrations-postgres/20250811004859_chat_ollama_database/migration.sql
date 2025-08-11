-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" INTEGER NOT NULL DEFAULT 0,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "access_token" TEXT,
    "updated_at" TIMESTAMP(3),
    "provider" TEXT,
    "provider_id" TEXT,
    "avatar" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KnowledgeBase" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "embedding" TEXT,
    "description" TEXT,
    "created" TIMESTAMP(3),
    "updated" TIMESTAMP(3),
    "parentChunkSize" INTEGER,
    "parentChunkOverlap" INTEGER,
    "childChunkSize" INTEGER,
    "childChunkOverlap" INTEGER,
    "parentK" INTEGER,
    "childK" INTEGER,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KnowledgeBaseFile" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "knowledgeBaseId" INTEGER NOT NULL,

    CONSTRAINT "KnowledgeBaseFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Instruction" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "user_id" INTEGER,
    "is_public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Instruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mcp_servers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "command" TEXT,
    "args" TEXT,
    "url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mcp_server_env_vars" (
    "id" SERIAL NOT NULL,
    "mcp_server_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_server_env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "public"."User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "public"."KnowledgeBase"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Instruction_name_key" ON "public"."Instruction"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_servers_name_key" ON "public"."mcp_servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_env_vars_mcp_server_id_key_key" ON "public"."mcp_server_env_vars"("mcp_server_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "public"."KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KnowledgeBaseFile" ADD CONSTRAINT "KnowledgeBaseFile_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Instruction" ADD CONSTRAINT "Instruction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mcp_server_env_vars" ADD CONSTRAINT "mcp_server_env_vars_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
