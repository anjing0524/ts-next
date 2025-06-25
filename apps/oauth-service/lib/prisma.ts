/**
 * OAuth Service Prisma 数据库配置
 * OAuth Service Prisma database configuration
 * 
 * 重新导出共享的 Prisma 客户端
 * Re-exports shared Prisma client
 */

// 重新导出共享的 Prisma 客户端 (Re-export shared Prisma client)
export { prisma } from '@repo/database';

// 导出数据库客户端类型 (Export database client types)
export type { PrismaClient } from '@prisma/client'; 