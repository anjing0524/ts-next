import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager } from '../utils/test-helpers';

describe('OAuth2核心端点测试 - UserInfo & Revoke', () => {
  let httpClient: TestHttpClient;
  let dataManager: TestDataManager;
  let testUser: any;
  let testClient: any;

  beforeEach(async () => {
    httpClient = new TestHttpClient();
    dataManager = new TestDataManager();

    await dataManager.clearDatabase();

    // 创建测试用户
    testUser = await dataManager.createUser({
      email: 'userinfo@oauth-test.com',
      password: 'SecurePass123!',
      firstName: 'UserInfo',
      lastName: 'TestUser',
    });

    // 创建测试客户端
    testClient = await dataManager.createClient({
      clientId: 'userinfo-test-client',
      name: 'UserInfo Test Client',
      redirectUris: ['https://app.example.com/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email'],
      isPublic: true,
      isActive: true,
    });
  });

  afterEach(async () => {
    await dataManager.clearDatabase();
  });

  describe('GET /api/oauth/userinfo - 用户信息端点', () => {
    it('应该返回基本的OpenID Connect用户信息', async () => {
      // 创建包含openid作用域的访问令牌
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid'
      );

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        sub: testUser.id,
        iss: expect.any(String),
        aud: testClient.clientId,
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
    });

    it('应该根据profile作用域返回个人资料信息', async () => {
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile'
      );

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        sub: testUser.id,
        given_name: testUser.firstName,
        family_name: testUser.lastName,
        name: `${testUser.firstName} ${testUser.lastName}`,
      });
    });

    it('应该拒绝缺少Authorization头的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toMatchObject({
        error: 'invalid_token',
        error_description: expect.stringContaining('Missing access token'),
      });
    });

    it('应该拒绝无效的访问令牌', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid_token',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('invalid_token');
    });

    it('应该拒绝缺少openid作用域的令牌', async () => {
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'profile email' // 没有openid作用域
      );

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toMatchObject({
        error: 'insufficient_scope',
        error_description: expect.stringContaining('openid scope required'),
      });
    });
  });

  describe('POST /api/oauth/revoke - 令牌撤销端点', () => {
    it('应该成功撤销访问令牌', async () => {
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile'
      );

      const response = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({}); // RFC 7009: 成功撤销返回空响应

      // 验证令牌不能再用于访问资源
      const userinfoResponse = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      expect(userinfoResponse.status).toBe(401);
    });

    it('应该成功撤销刷新令牌', async () => {
      const refreshToken = await dataManager.createRefreshToken(
        testUser.id!,
        testClient.clientId,
        'openid profile'
      );

      const response = await httpClient.formRequest('/api/oauth/revoke', {
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: testClient.clientId,
      });

      expect(response.status).toBe(200);
    });

    it('应该拒绝缺少token参数的请求', async () => {
      const response = await httpClient.formRequest('/api/oauth/revoke', {
        client_id: testClient.clientId,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('Missing required parameter: token'),
      });
    });

    it('应该允许重复撤销同一个令牌', async () => {
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile'
      );

      // 第一次撤销
      const response1 = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });
      expect(response1.status).toBe(200);

      // 第二次撤销同一个令牌
      const response2 = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });
      expect(response2.status).toBe(200);
    });
  });
});
