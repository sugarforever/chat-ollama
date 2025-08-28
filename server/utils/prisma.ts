import { PrismaClient } from '@prisma/client';

// Implement singleton pattern to prevent multiple instances
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Store in global for both development AND production to ensure singleton
globalForPrisma.prisma = prisma

export default prisma;
