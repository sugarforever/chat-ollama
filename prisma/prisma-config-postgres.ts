// prisma.config.ts
import "dotenv/config" // Loads .env variables if needed
import type { PrismaConfig } from "prisma"

export default {
  // Relative path to your Prisma schema file
  schema: "./schema-postgres.prisma",

  // Directory for migrations (relative to this config file’s location)
  migrations: {
    path: "./migrations-postgres",
  },
} satisfies PrismaConfig
