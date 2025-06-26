/**
 * MySQL 客户端
 * 复用 @repo/database 包的数据库连接
 */
export { prisma } from '@repo/database';

/**
 * MySQL 客户端实例
 * MySQL client instance
 */

import { checkPoolHealth as baseCheckPoolHealth } from '@repo/database';

/**
 * 导出检查连接池健康状态函数
 * Export check pool health function
 */
export { baseCheckPoolHealth as checkPoolHealth };
