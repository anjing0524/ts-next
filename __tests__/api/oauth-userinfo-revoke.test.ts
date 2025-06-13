import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG

describe('OAuth2核心端点测试 - UserInfo与Revoke / OAuth2 Core Endpoints Tests - UserInfo & Revoke', () => {
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

  describe('GET /api/oauth/userinfo - 用户信息端点 / UserInfo Endpoint', () => {
    it('TC_OUR_001_001: 应返回基本的OpenID Connect用户信息 / Should return basic OpenID Connect user information', async () => {
      const accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'openid');

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const data = await response.json();
      expect(data.sub).toBe(testUser.id);
      expect(data.iss).toEqual(expect.any(String));
      expect(data.aud).toBe(testClient.clientId);
      expect(data.iat).toEqual(expect.any(Number));
      expect(data.exp).toEqual(expect.any(Number));
    });

    it('TC_OUR_001_002: 应根据profile作用域返回个人资料信息 / Should return profile information based on profile scope', async () => {
      const accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'openid profile');

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const data = await response.json();
      expect(data.sub).toBe(testUser.id);
      expect(data.given_name).toBe(testUser.firstName);
      expect(data.family_name).toBe(testUser.lastName);
      expect(data.name).toBe(`${testUser.firstName} ${testUser.lastName}`);
    });

    it('TC_OUR_001_003: 应拒绝缺少Authorization头的请求 / Should reject request missing Authorization header', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', { method: 'GET' });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
      expect(data.error_description).toContain('Missing access token');
    });

    it('TC_OUR_001_004: 应拒绝无效的访问令牌 / Should reject invalid access token', async () => {
      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid_token_value' },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
    });

    it('TC_OUR_001_005: 应拒绝缺少openid作用域的令牌 / Should reject token missing openid scope', async () => {
      const accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'profile email'); // No openid

      const response = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_SCOPE);
      expect(data.error_description).toContain('openid scope is required');
    });
  });

  describe('POST /api/oauth/revoke - 令牌撤销端点 / Token Revocation Endpoint', () => {
    it('TC_OUR_002_001: 应成功撤销访问令牌 / Should successfully revoke an access token', async () => {
      const accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'openid profile');

      const response = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const responseBody = await response.text(); // RFC7009: empty body for 200 OK
      expect(responseBody).toBe('');


      const userinfoResponse = await httpClient.makeRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('TC_OUR_002_002: 应成功撤销刷新令牌 / Should successfully revoke a refresh token', async () => {
      const refreshToken = await dataManager.createRefreshToken(testUser.id!, testClient.clientId, 'openid profile');

      const response = await httpClient.formRequest('/api/oauth/revoke', {
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: testClient.clientId,
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });

    it('TC_OUR_002_003: 应拒绝缺少token参数的请求 / Should reject request missing token parameter', async () => {
      const response = await httpClient.formRequest('/api/oauth/revoke', { client_id: testClient.clientId });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
      expect(data.error_description).toContain('Missing required parameter: token');
    });

    it('TC_OUR_002_004: 应允许重复撤销同一个令牌（返回200 OK）/ Should allow repeated revocation of the same token (return 200 OK)', async () => {
      const accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'openid profile');

      const response1 = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });
      expect(response1.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const response2 = await httpClient.formRequest('/api/oauth/revoke', {
        token: accessToken,
        client_id: testClient.clientId,
      });
      expect(response2.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });
  });
});
