import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG

describe('OAuth撤销API单元测试 / OAuth Revoke API Unit Tests', () => {
  let httpClient: TestHttpClient;
  let dataManager: TestDataManager;

  beforeEach(async () => {
    httpClient = new TestHttpClient();
    dataManager = new TestDataManager();
    await dataManager.clearDatabase();
  });

  afterEach(async () => {
    await dataManager.clearDatabase();
  });

  describe('POST /api/oauth/revoke - 参数验证 / Parameter Validation', () => {
    it('TC_ORU_001_001: 应该因缺少Content-Type拒绝请求 / Should reject request with missing Content-Type', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        body: 'token=test_token', // No Content-Type header
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_ORU_001_002: 应该因无效Content-Type拒绝请求 / Should reject request with invalid Content-Type', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Invalid Content-Type
        body: JSON.stringify({ token: 'test_token' }),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_ORU_001_003: 应该因缺少token参数拒绝请求 / Should reject request missing token parameter', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=test_client', // Missing token
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
      expect(data.error_description).toContain('token');
    });

    it('TC_ORU_001_004: 应该因token参数为空拒绝请求 / Should reject request with empty token parameter', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=', // Empty token
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_ORU_001_005: 应该因缺少客户端认证拒绝请求 / Should reject request missing client authentication', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=test_token_123', // No client_id or Authorization header
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_ORU_001_006: 应该因无效客户端ID拒绝请求 / Should reject request with invalid client_id', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=test_token&client_id=invalid_client',
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_ORU_001_007: 应该因无效Basic认证拒绝请求 / Should reject request with invalid Basic authentication', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic invalid_credentials', // Malformed Basic auth
        },
        body: 'token=test_token',
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_ORU_001_008: 应该正确处理OPTIONS请求 / Should correctly handle OPTIONS request', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', { method: 'OPTIONS' });
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]).toContain(response.status);
    });

    it('TC_ORU_001_009: 应该因不支持的HTTP方法拒绝请求 / Should reject request with unsupported HTTP method', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', { method: 'GET' });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED);
    });

    it('TC_ORU_001_010: 响应中应包含正确的Content-Type头 / Should return correct Content-Type header in response', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'token=test', // This will likely be an error (e.g. invalid_client)
      });
      // Error responses should also be application/json
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('有效客户端测试 / Valid Client Tests', () => {
    it('TC_ORU_002_001: 应处理有效客户端的令牌撤销请求 / Should handle token revocation request for a valid client', async () => {
      const user = await dataManager.createUser({ email: 'revoke-unit@example.com', password: 'TestPass123!', firstName: 'RevokeUnit', lastName: 'User' });
      const client = await dataManager.createClient({
        clientId: 'revoke-test-client-unit', name: 'Revoke Test Client Unit', redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'], responseTypes: ['code'], scope: 'openid profile',
        isPublic: true, isActive: true,
      });
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid');

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${accessToken}&client_id=${client.clientId}`,
      });
      // As per RFC 7009, server SHOULD return 200 OK for valid client & well-formed request,
      // regardless of whether the token was valid or found.
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });

    it('TC_ORU_002_002: 应处理不存在令牌的撤销请求（返回200 OK）/ Should handle revocation request for a non-existent token (return 200 OK)', async () => {
      const client = await dataManager.createClient({
        clientId: 'revoke-test-client-unit-2', name: 'Revoke Test Client Unit 2', redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'], responseTypes: ['code'], scope: 'openid',
        isPublic: true, isActive: true,
      });

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=nonexistent_token_value&client_id=${client.clientId}`,
      });
      // RFC 7009: Server should return HTTP 200 OK to prevent a client from
      // determining whether or not a token is invalid.
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });
  });
});
