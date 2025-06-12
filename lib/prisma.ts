import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  __vitestConnectedPrisma?: PrismaClient;
};

let prismaInstance: PrismaClient;

if (process.env.NODE_ENV === 'test' && globalForPrisma.__vitestConnectedPrisma && typeof globalForPrisma.__vitestConnectedPrisma.$connect === 'function') {
  // In test environment, prioritize the instance connected by vitest.setup.ts
  prismaInstance = globalForPrisma.__vitestConnectedPrisma;
} else if (globalForPrisma.prisma && typeof globalForPrisma.prisma.$connect === 'function') {
  // Otherwise, use the existing global prisma instance if functional
  prismaInstance = globalForPrisma.prisma;
} else {
  // If no functional prisma instance exists, create a new one.
  prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
  // In non-production environments, store the new instance on globalThis.prisma (standard location)
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prismaInstance;
  }
}

export const prisma = prismaInstance;
