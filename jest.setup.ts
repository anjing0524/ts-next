// Jest setup file for Next.js 15 with Prisma database testing
import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '@repo/database/client';

// 设置测试环境变量
// NODE_ENV 应该在Jest配置中设置，这里只设置数据库URL
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test.db';

// JWT and OIDC related environment variables for testing
// IMPORTANT: These are dummy values for testing only. Use secure, real values in production.
// Replace dummy content with structurally valid PEM strings
process.env.JWT_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEILft995n2CH3utZGk2d6C8Q4MGCcMLPQUr3/A745d9hR
-----END PRIVATE KEY-----`; // Dummy EdDSA private key (structurally valid)
process.env.JWT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVa53253F5N9N/N0L9A5f7L0D8K7i4Jj0v2Y8Z8VwZ8I=
-----END PUBLIC KEY-----`; // Dummy EdDSA public key (structurally valid)
process.env.JWT_ISSUER = 'http://localhost:3000/test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.JWT_KEY_ID = 'test-key-id-2024';
process.env.JWKS_URI = 'http://localhost:3000/api/v2/.well-known/jwks.json'; // Mock JWKS URI
process.env.ID_TOKEN_SECRET = 'test-id-token-secret-string-for-hs256-if-needed'; // For symmetric ID token if used, though RSA is preferred

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
  try {
    // 使用Prisma客户端的deleteMany方法按依赖关系顺序清理
    await prisma.tokenBlacklist.deleteMany();
    await prisma.accessToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.authorizationCode.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.consentGrant.deleteMany();
    await prisma.revokedAuthJti.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.passwordHistory.deleteMany();
    await prisma.loginAttempt.deleteMany();
    await prisma.oAuthClient.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.apiPermission.deleteMany();
    await prisma.menuPermission.deleteMany();
    await prisma.dataPermission.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.scope.deleteMany();
    await prisma.systemConfiguration.deleteMany();
    await prisma.securityPolicy.deleteMany();
  } catch (error) {
    console.warn('Warning: Could not clean database:', error);
  }
}

// 导出清理函数供测试使用
export { cleanupTestDatabase };
