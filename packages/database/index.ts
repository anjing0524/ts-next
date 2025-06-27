export * from '@prisma/client';
export { prisma as default, prisma } from './client';

// MySQL 客户端工具
export {
  default as mysqlPool,
  checkPoolHealth,
  closePool,
  getPool,
  dbConfig,
} from './mysql-client';
