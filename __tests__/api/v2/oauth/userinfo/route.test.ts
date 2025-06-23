// 文件路径: __tests__/api/v2/oauth/userinfo/route.test.ts
// 描述: OAuth2.1 UserInfo端点完整测试套件
// 测试重点: JWT令牌认证(Jose库)、scope验证、用户信息返回、OIDC合规性

import { jest } from '@jest/globals'; // 新增导入
import { NextRequest } from 'next/server';
import { GET } from 'oauth-service/app/api/v2/oauth/userinfo/route';
import { prisma } from '@repo/database/client';
import { authenticateBearer } from '@repo/lib/auth';
import { createTestAuthCenterSessionToken, createTestUser, cleanupTestData } from '../../../../setup/test-helpers';

// 模拟依赖
const mockPrismaUserFindUnique = jest.fn();
jest.mock('@repo/database/client', () => ({
  prisma: {
    user: {
      findUnique: mockPrismaUserFindUnique,
    },
  },
}));

const mockAuthenticateBearer = jest.fn();
jest.mock('@repo/lib/auth', () => ({
  authenticateBearer: mockAuthenticateBearer,
}));

describe('OAuth2.1 UserInfo端点 (/api/v2/oauth/userinfo)', () => {
  // 测试数据
  let testUser: any;
  let validAccessToken: string;

  beforeAll(async () => {
    // 生成有效的访问令牌
    validAccessToken = await createTestAuthCenterSessionToken('test_user_001');
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // 创建测试用户
    testUser = await createTestUser({
      id: 'test_user_001',
      email: 'test@example.com',
      username: 'johndoe',
      isActive: true,
    });

    // 设置模拟返回值
    mockPrismaUserFindUnique.mockResolvedValue(testUser);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('✅ 成功获取用户信息', () => {
    test('应该成功返回基本用户信息 (openid scope)', async () => {
      // 模拟成功的Bearer认证
      mockAuthenticateBearer.mockResolvedValue({
        success: true,
        context: {
          userId: testUser.id,
          clientId: 'test_client_001',
          scopes: ['openid'],
          permissions: ['user:read'],
        },
      });

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/userinfo', {
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();

      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('sub', testUser.id);
      expect(responseData.message).toBe('User information retrieved successfully.');

      // 验证数据库查询
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: {
          id: testUser.id,
          isActive: true,
        },
      });
    });

    test('应该拒绝缺少openid scope的令牌', async () => {
      mockAuthenticateBearer.mockResolvedValue({
        success: false,
        response: new Response(JSON.stringify({
          success: false,
          error: {
            code: 'insufficient_scope',
            message: 'The "openid" scope is required to access UserInfo endpoint.',
          },
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/userinfo', {
        headers: {
          'Authorization': `Bearer ${validAccessToken}`,
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(403);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('insufficient_scope');
    });
  });

  describe('❌ 认证失败', () => {
    test('应该拒绝无效的JWT令牌', async () => {
      mockAuthenticateBearer.mockResolvedValue({
        success: false,
        response: new Response(JSON.stringify({
          success: false,
          error: {
            code: 'invalid_token',
            message: 'Invalid token or signature',
          },
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/userinfo', {
        headers: {
          'Authorization': 'Bearer invalid_jwt_token',
        },
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_token');
    });
  });
});

// OIDC合规性测试
describe('🌐 OIDC合规性测试', () => {
  test('应该符合OIDC Core 1.0规范', async () => {
    // 验证返回的claims符合OIDC标准
    const testUser = createTestUser({
      id: 'oidc_test_user',
      email: 'oidc@example.com',
      firstName: 'OIDC',
      lastName: 'Test',
      username: 'oidctest',
      emailVerified: true,
      isActive: true,
    });

    mockPrismaUserFindUnique.mockResolvedValue(testUser);
    mockAuthenticateBearer.mockResolvedValue({
      success: true,
      context: {
        userId: testUser.id,
        clientId: 'oidc_client',
        scopes: ['openid', 'profile', 'email'],
        permissions: ['user:read'],
      },
    });

    const request = new NextRequest('http://localhost:3000/api/v2/oauth/userinfo', {
      headers: {
        'Authorization': 'Bearer valid_oidc_token',
      },
    });

    const response = await GET(request);
    const responseData = await response.json();

    // 验证必需的OIDC claims
    expect(responseData.data).toHaveProperty('sub'); // 必需
    expect(responseData.data).toHaveProperty('name'); // profile scope
    expect(responseData.data).toHaveProperty('given_name'); // profile scope
    expect(responseData.data).toHaveProperty('family_name'); // profile scope
    expect(responseData.data).toHaveProperty('email'); // email scope
    expect(responseData.data).toHaveProperty('email_verified'); // email scope

    // 验证数据类型
    expect(typeof responseData.data.sub).toBe('string');
    expect(typeof responseData.data.email_verified).toBe('boolean');
  });
});

// 性能测试
describe('🚀 性能测试', () => {
  test('应该在合理时间内响应', async () => {
    mockAuthenticateBearer.mockResolvedValue({
      success: true,
      context: {
        userId: 'perf_test_user',
        clientId: 'perf_client',
        scopes: ['openid', 'profile'],
        permissions: ['user:read'],
      },
    });

    const request = new NextRequest('http://localhost:3000/api/v2/oauth/userinfo', {
      headers: {
        'Authorization': 'Bearer performance_test_token',
      },
    });

    const startTime = Date.now();
    const response = await GET(request);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(500); // 应该在500ms内响应
    expect(response).toBeDefined();
  }, 5000);
}); 