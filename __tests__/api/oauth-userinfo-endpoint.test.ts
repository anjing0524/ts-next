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

describe('OAuth2.1 用户信息端点测试 / OAuth2.1 UserInfo Endpoint Tests', () => {
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

  describe('GET /api/oauth/userinfo - 基础功能测试 / Basic Functionality Tests', () => {
    it('TC_OUI_001_001: 应返回完整的用户信息（包含profile和email作用域）/ Should return full user information for profile and email scopes', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.name).toBeDefined();
      expect(userInfo.preferred_username).toBe(user.username);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBe(user.lastName);
      expect(userInfo.updated_at).toBeTypeOf('number');
      expect(userInfo.email).toBe(user.email);
      expect(userInfo.email_verified).toBe(user.emailVerified);

      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('TC_OUI_001_002: 应只返回openid作用域的基础信息 (sub) / Should return only basic information (sub) for openid scope', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('PUBLIC');

      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid');
      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.sub).toBe(user.id);
      expect(Object.keys(userInfo).length).toBe(1); // Only 'sub'
      expect(userInfo.name).toBeUndefined();
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.preferred_username).toBeUndefined();
    });

    it('TC_OUI_001_003: 应只返回profile作用域的信息（不含email）/ Should return only profile information (no email) for profile scope', async () => {
      const user = await dataManager.createTestUser('ADMIN');
      const client = await dataManager.createTestClient('WEB_APP');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.name).toBeDefined();
      expect(userInfo.preferred_username).toBe(user.username);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBe(user.lastName);

      expect(userInfo.email).toBeUndefined();
      expect(userInfo.email_verified).toBeUndefined();
    });

    it('TC_OUI_001_004: 应只返回email作用域的信息（不含profile）/ Should return only email information (no profile) for email scope', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBe(user.email);
      expect(userInfo.email_verified).toBe(user.emailVerified);

      expect(userInfo.name).toBeUndefined();
      expect(userInfo.preferred_username).toBeUndefined();
      expect(userInfo.given_name).toBeUndefined();
      expect(userInfo.family_name).toBeUndefined();
    });
  });

  describe('POST /api/oauth/userinfo - HTTP方法支持 / HTTP Method Support', () => {
    it('TC_OUI_002_001: 应支持POST方法请求用户信息 / Should support POST method for UserInfo request', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json', // Content-Type can be other valid types for POST if body is not used for params
        },
      });

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBe(user.email);
    });

    it('TC_OUI_002_002: 应拒绝PUT方法（返回405 Method Not Allowed）/ Should reject PUT method (return 405 Method Not Allowed)', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid'
      );

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: 'test' }),
      });

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED);
    });
  });

  describe('错误处理和安全测试 / Error Handling and Security Tests', () => {
    it('TC_OUI_003_001: 应拒绝无效的访问令牌 / Should reject invalid access token', async () => {
      const response = await httpClient.getUserInfo('invalid-token');

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toBeDefined();
    });

    it('TC_OUI_003_002: 应拒绝过期的访问令牌 / Should reject expired access token', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const expiredToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile');

      const { TestUtils } = await import('../utils/test-helpers');
      const tokenHash = TestUtils.createTokenHash(expiredToken);
      await prisma.accessToken.update({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 60000) }, // Expired 1 minute ago
      });

      const response = await httpClient.getUserInfo(expiredToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toContain('Access token has expired');
    });

    it('TC_OUI_003_003: 应拒绝已撤销的访问令牌 / Should reject revoked access token', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile');

      const { TestUtils } = await import('../utils/test-helpers');
      const tokenHash = TestUtils.createTokenHash(accessToken);
      await prisma.accessToken.update({
        where: { tokenHash },
        data: { revoked: true, revokedAt: new Date() },
      });

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toContain('Access token has been revoked');
    });

    it('TC_OUI_003_004: 应拒绝缺少openid作用域的令牌 / Should reject token missing openid scope', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'profile email'); // Missing openid

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      const error = await response.json();
      expect(error.error).toBe('insufficient_scope');
      expect(error.error_description).toContain('openid scope is required');
    });

    it('TC_OUI_003_005: 应拒绝没有Authorization头的请求 / Should reject request with no Authorization header', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', { method: 'GET' });
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token'); // Or specific error for missing header
    });

    it('TC_OUI_003_006: 应拒绝错误格式的Authorization头 / Should reject request with malformed Authorization header', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: 'InvalidFormat token123' },
      });
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token'); // Or specific error for malformed header
    });

    it('TC_OUI_003_007: 应处理用户不存在的情况（无效令牌）/ Should handle non-existent user (invalid token)', async () => {
      const response = await httpClient.getUserInfo('invalid-jwt-token-for-non-existent-user');
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const result = await response.json();
      expect(result.error).toBe('invalid_token');
    });

    it('TC_OUI_003_008: 应拒绝不活跃用户的访问令牌 / Should reject access token for inactive user', async () => {
      const inactiveUser = await dataManager.createTestUser('INACTIVE');
      await prisma.user.update({ where: { id: inactiveUser.id }, data: { isActive: false } });
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(inactiveUser.id!, client.clientId, 'openid profile');

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toContain('User is inactive');
    });

    it('TC_OUI_003_009: 如果用户在令牌颁发后被删除，应返回401 / Should return 401 if user is deleted after token issuance', async () => {
      const userToDelete = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(userToDelete.id!, client.clientId, 'openid profile');

      await prisma.user.delete({ where: { id: userToDelete.id! } });

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
      expect(error.error_description).toContain('User not found');
    });
  });

  describe('Profile作用域声明详情 / Profile Scope Claim Details', () => {
    it('TC_OUI_004_001: 当只有firstName时，name应为firstName，且有given_name / When only firstName, name is firstName, has given_name', async () => {
      const user = await dataManager.createUser({
        username: 'firstname_only',
        email: 'fname@test.com',
        password: 'Password123!',
        firstName: 'JustFirst',
        lastName: null,
        isActive: true,
        emailVerified: true,
      });
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile');

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.name).toBe(user.firstName);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBeUndefined();
      expect(userInfo.preferred_username).toBe(user.username);
    });

    it('TC_OUI_004_002: 当只有lastName时，name应为lastName，且有family_name / When only lastName, name is lastName, has family_name', async () => {
      const user = await dataManager.createUser({
        username: 'lastname_only',
        email: 'lname@test.com',
        password: 'Password123!',
        firstName: null,
        lastName: 'JustLast',
        isActive: true,
        emailVerified: true,
      });
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile');

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.name).toBe(user.lastName);
      expect(userInfo.family_name).toBe(user.lastName);
      expect(userInfo.given_name).toBeUndefined();
      expect(userInfo.preferred_username).toBe(user.username);
    });

    it('TC_OUI_004_003: 当firstName和lastName都存在时，name应为 "firstName lastName" / When both firstName and lastName, name is "firstName lastName"', async () => {
      const user = await dataManager.createUser({
        username: 'full_name_user_oui',
        email: 'fullname_oui@test.com',
        password: 'Password123!',
        firstName: 'FullName',
        lastName: 'User',
        isActive: true,
        emailVerified: true,
      });
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile');

      const response = await httpClient.getUserInfo(accessToken);
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.name).toBe(`${user.firstName} ${user.lastName}`);
      expect(userInfo.given_name).toBe(user.firstName);
      expect(userInfo.family_name).toBe(user.lastName);
      expect(userInfo.preferred_username).toBe(user.username);
    });

    it('TC_OUI_004_004: 当firstName和lastName都为空时，name应为username / When firstName and lastName are null, name is username', async () => {
      const user = await dataManager.createUser({
        username: 'test-no-names-oui',
        email: 'nonames_oui@test.com',
        password: 'Password123!',
        firstName: null, // Explicitly null
        lastName: null, // Explicitly null
        isActive: true,
        emailVerified: true,
      });

      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();
      expect(userInfo.name).toBe(user.username);
      expect(userInfo.given_name).toBeUndefined();
      expect(userInfo.family_name).toBeUndefined();
      expect(userInfo.preferred_username).toBe(user.username);
    });
  });

  describe('边界条件和特殊情况 / Boundary Conditions and Special Cases', () => {
    it('TC_OUI_005_001: 应处理用户邮箱为空的情况 / Should handle case where user email is null', async () => {
      const user = await dataManager.createUser({
        username: 'test-no-email-oui',
        email: 'temp-oui@test.com',
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

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();
      expect(userInfo.sub).toBe(user.id);
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.email_verified).toBeUndefined();
    });

    it('TC_OUI_005_002: 应正确处理updated_at时间戳 / Should correctly handle updated_at timestamp', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();
      expect(userInfo.updated_at).toBeTypeOf('number');
      expect(userInfo.updated_at).toBeGreaterThan(0);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      expect(userInfo.updated_at).toBeLessThanOrEqual(currentTimestamp);
    });
  });

  describe('性能和并发测试 / Performance and Concurrency Tests', () => {
    it('TC_OUI_006_001: 应处理并发的用户信息请求 / Should handle concurrent UserInfo requests', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid profile email');

      const requestPromises = Array(10).fill(null).map(() => httpClient.getUserInfo(accessToken));
      const responses = await Promise.all(requestPromises);

      responses.forEach((response) => {
        TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      });

      const userInfos = await Promise.all(responses.map((r) => r.json()));
      userInfos.forEach((userInfo) => {
        expect(userInfo.sub).toBe(user.id);
        expect(userInfo.email).toBe(user.email);
      });
    });

    it('TC_OUI_006_002: 应在合理时间内响应 / Should respond within a reasonable timeframe', async () => {
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

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(1000); // Example: 1 second
    });
  });

  describe('OpenID Connect标准合规性 / OpenID Connect Standard Compliance', () => {
    it('TC_OUI_007_001: 应返回符合OpenID Connect标准的用户信息格式 / Should return UserInfo in OpenID Connect standard format', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile email'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      const userInfo = await response.json();

      expect(userInfo.sub).toBeDefined();
      expect(typeof userInfo.sub).toBe('string');

      if (userInfo.email_verified !== undefined) { // email_verified is optional
        expect(typeof userInfo.email_verified).toBe('boolean');
      }
      if (userInfo.updated_at !== undefined) { // updated_at is optional
        expect(typeof userInfo.updated_at).toBe('number');
      }
      // Other standard claims can be checked here if applicable (name, given_name, family_name, etc.)
    });

    it('TC_OUI_007_002: 应设置正确的HTTP响应头 / Should set correct HTTP response headers', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.clientId,
        'openid profile'
      );

      const response = await httpClient.getUserInfo(accessToken);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache'); // Pragma is often included with no-store
    });
  });
});
