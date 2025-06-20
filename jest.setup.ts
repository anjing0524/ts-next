// Jest setup file for Next.js 15 with Prisma database testing
import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';

// 设置测试环境变量
// NODE_ENV 应该在Jest配置中设置，这里只设置数据库URL
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test.db';

// 全局测试设置
beforeAll(async () => {
  // 确保数据库连接
  await prisma.$connect();
  
  // 清理测试数据库
  await cleanupTestDatabase();
});

afterAll(async () => {
  // 清理测试数据
  await cleanupTestDatabase();
  
  // 断开数据库连接
  await prisma.$disconnect();
});

beforeEach(async () => {
  // 每个测试前清理数据
  await cleanupTestDatabase();
});

// 清理测试数据库的函数
async function cleanupTestDatabase() {
  // 对于SQLite，我们需要手动清理每个表
  const tables = [
    'TokenBlacklist',
    'AccessToken', 
    'RefreshToken',
    'AuthorizationCode',
    'UserRole',
    'RolePermission',
    'OAuthClient',
    'User',
    'Role',
    'Permission',
    'Scope'
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
    } catch (error) {
      // 忽略表不存在的错误
      console.log(`Warning: Could not clean table ${table}:`, error);
    }
  }
}

// 导出清理函数供测试使用
export { cleanupTestDatabase }; 