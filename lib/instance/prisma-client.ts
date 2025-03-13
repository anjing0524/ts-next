import logger from '@/utils/logger';
import { PrismaClient } from '@prisma/client';

// 声明全局变量类型
declare global {
  // 正确扩展 globalThis 的类型
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | null;
}

// 使用 globalThis 来存储 Prisma 实例，避免热重载时重复初始化
const prisma = globalThis.prisma || new PrismaClient();

// 只在非生产环境下将实例挂载到 globalThis 上
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
  logger.info('Prisma 客户端已初始化（开发环境）');
}

export default prisma;
