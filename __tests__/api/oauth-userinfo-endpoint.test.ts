import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestHttpClient,
  TestDataManager,
  TestAssertions,
  TEST_USERS,
  TEST_CLIENTS,
  TEST_CONFIG,
  createTestSetup,
} from '../utils/test-helpers';
import { prisma } from '@/lib/prisma';

describe('OAuth2.1 UserInfo Endpoint Tests', () => {
  const httpClient = new TestHttpClient();
  const dataManager = new TestDataManager();
  const { setup, cleanup } = createTestSetup('oauth-userinfo-endpoint');

  beforeEach(async () => {
    await setup();
    await dataManager.setupBasicScopes();
  });

  afterEach(async () => {
    await dataManager.cleanup();
    await cleanup();
  });

  describe('GET /api/oauth/userinfo - 基础功能测试', () => {
    it('应该返回完整的用户信息（包含profile和email作用域）', async () => {
      // 创建测试用户和客户端
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      // 创建包含所有作用域的访问令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      // 请求用户信息
      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();

      // 验证基础字段
      expect(userInfo.sub).toBe(user.id);

      // 验证profile作用域字段
      expect(userInfo.name).toBeDefined();
      expect(userInfo.preferred_username).toBe(user.username);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBe(user.lastName);
      expect(userInfo.updated_at).toBeTypeOf('number');

      // 验证email作用域字段
      expect(userInfo.email).toBe(user.email);
      expect(userInfo.email_verified).toBe(user.emailVerified);

      // 验证响应头
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('应该只返回openid作用域的基础信息', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('PUBLIC');

      // 只包含openid作用域的令牌
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid');

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();

      // 只应该包含sub字段
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.name).toBeUndefined();
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.preferred_username).toBeUndefined();
    });

    it('应该只返回profile作用域的信息（不包含email）', async () => {
      const user = await dataManager.createTestUser('ADMIN');
      const client = await dataManager.createTestClient('WEB_APP');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();

      // 应该包含profile信息
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.name).toBeDefined();
      expect(userInfo.preferred_username).toBe(user.username);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBe(user.lastName);

      // 不应该包含email信息
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.email_verified).toBeUndefined();
    });

    it('应该只返回email作用域的信息（不包含profile）', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();

      // 应该包含基础和email信息
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBe(user.email);
      expect(userInfo.email_verified).toBe(user.emailVerified);

      // 不应该包含profile信息
      expect(userInfo.name).toBeUndefined();
      expect(userInfo.preferred_username).toBeUndefined();
      expect(userInfo.given_name).toBeUndefined();
      expect(userInfo.family_name).toBeUndefined();
    });
  });

  describe('POST /api/oauth/userinfo - HTTP方法支持', () => {
    it('应该支持POST方法请求用户信息', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      // 使用POST方法
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBe(user.email);
    });
  });

  describe('错误处理和安全测试', () => {
    it('应该拒绝无效的访问令牌', async () => {
      const response = await httpClient.getUserInfo('invalid-token');

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);

      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toBeDefined();
    });

    it('应该拒绝过期的访问令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      // 创建令牌
      const expiredToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      // 手动设置令牌为过期状态
      const { TestUtils } = await import('../utils/test-helpers');
      const tokenHash = TestUtils.createTokenHash(expiredToken);
      await prisma.accessToken.update({
        where: { tokenHash },
        data: {
          expiresAt: new Date(Date.now() - 60000), // 1分钟前过期
        },
      });

      const response = await httpClient.getUserInfo(expiredToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);

      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('应该拒绝已撤销的访问令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      // 手动撤销令牌
      const { TestUtils } = await import('../utils/test-helpers');
      const tokenHash = TestUtils.createTokenHash(accessToken);
      await prisma.accessToken.update({
        where: { tokenHash },
        data: {
          revoked: true,
          revokedAt: new Date(),
        },
      });

      // 尝试使用已撤销的令牌
      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);

      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('应该拒绝缺少openid作用域的令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      // 创建不包含openid作用域的令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'profile email' // 缺少openid
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);

      const error = await response.json();
      expect(error.error).toBe('insufficient_scope');
    });

    it('应该拒绝没有Authorization头的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);

      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('应该拒绝错误格式的Authorization头', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: 'InvalidFormat token123',
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);

      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('应该处理用户不存在的情况', async () => {
      // 创建一个包含不存在用户ID的无效JWT令牌
      const response = await httpClient.getUserInfo('invalid-jwt-token-for-non-existent-user');

      const result = await response.json();

      // 应该返回401错误，因为令牌无效
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      expect(result.error).toBe('invalid_token');
    });
  });

  describe('边界条件和特殊情况', () => {
    it('应该处理用户名为空的情况', async () => {
      // 创建没有firstName和lastName的用户
      const user = await dataManager.createUser({
        username: 'test-no-names',
        email: 'nonames@test.com',
        password: 'Password123!',
        firstName: '', // 空字符串
        lastName: '', // 空字符串
        isActive: true,
        emailVerified: true,
      });

      // 手动将firstName和lastName设为null
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: null,
          lastName: null,
        },
      });

      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();
      expect(userInfo.name).toBe(user.username); // 应该回退到username
      expect(userInfo.given_name).toBeUndefined();
      expect(userInfo.family_name).toBeUndefined();
    });

    it('应该处理用户邮箱为空的情况', async () => {
      const user = await dataManager.createUser({
        username: 'test-no-email',
        email: 'temp@test.com', // 先设置一个临时邮箱
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        emailVerified: false,
      });

      // 手动将邮箱设为null
      await prisma.user.update({
        where: { id: user.id },
        data: { email: null },
      });

      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.email_verified).toBeUndefined();
    });

    it('应该正确处理updated_at时间戳', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();
      expect(userInfo.updated_at).toBeTypeOf('number');
      expect(userInfo.updated_at).toBeGreaterThan(0);

      // 验证时间戳是合理的（不超过当前时间）
      const currentTimestamp = Math.floor(Date.now() / 1000);
      expect(userInfo.updated_at).toBeLessThanOrEqual(currentTimestamp);
    });
  });

  describe('性能和并发测试', () => {
    it('应该处理并发的用户信息请求', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      // 并发发送10个请求
      const promises = Array(10)
        .fill(null)
        .map(() => httpClient.getUserInfo(accessToken));

      const responses = await Promise.all(promises);

      // 所有请求都应该成功
      responses.forEach((response) => {
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      });

      // 验证响应内容一致性
      const userInfos = await Promise.all(responses.map((r) => r.json()));
      userInfos.forEach((userInfo) => {
        expect(userInfo.sub).toBe(user.id);
        expect(userInfo.email).toBe(user.email);
      });
    });

    it('应该在合理时间内响应', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      const startTime = Date.now();
      const response = await httpClient.getUserInfo(accessToken);
      const endTime = Date.now();

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      // 响应时间应该在合理范围内（小于1秒）
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(1000);
    });
  });

  describe('OpenID Connect标准合规性', () => {
    it('应该返回符合OpenID Connect标准的用户信息格式', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const userInfo = await response.json();

      // 验证必需的OpenID Connect字段
      expect(userInfo.sub).toBeDefined();
      expect(typeof userInfo.sub).toBe('string');

      // 验证可选的标准字段格式
      if (userInfo.email_verified !== undefined) {
        expect(typeof userInfo.email_verified).toBe('boolean');
      }

      if (userInfo.updated_at !== undefined) {
        expect(typeof userInfo.updated_at).toBe('number');
      }
    });

    it('应该设置正确的HTTP响应头', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      // 验证Content-Type
      expect(response.headers.get('content-type')).toContain('application/json');

      // 验证Cache-Control（用户信息不应该被缓存）
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
  });
});
