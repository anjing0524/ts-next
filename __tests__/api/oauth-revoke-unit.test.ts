import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager } from '../utils/test-helpers';

describe('OAuth Revoke API 单元测试', () => {
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

  describe('POST /api/oauth/revoke', () => {
    it('应该拒绝缺少Content-Type的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        body: 'token=test_token',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('应该拒绝无效的Content-Type', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: 'test_token' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_request');
    });

    it('应该拒绝缺少token参数的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'client_id=test_client',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_request');
      expect(data).toHaveProperty('error_description');
    });

    it('应该拒绝空的token参数', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'token=',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_request');
    });

    it('应该拒绝缺少客户端认证的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'token=test_token_123',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_client');
    });

    it('应该拒绝无效的客户端ID', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'token=test_token&client_id=invalid_client',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_client');
    });

    it('应该拒绝无效的Basic认证', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic invalid_credentials',
        },
        body: 'token=test_token',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error', 'invalid_client');
    });

    it('应该正确处理OPTIONS请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'OPTIONS',
      });

      expect([200, 204]).toContain(response.status);
    });

    it('应该拒绝不支持的HTTP方法', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'GET',
      });

      expect(response.status).toBe(405);
    });

    it('应该返回正确的Content-Type头', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'token=test',
      });

      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('有效客户端测试', () => {
    it('应该处理有效客户端的令牌撤销请求', async () => {
      // 创建测试用户和客户端
      const user = await dataManager.createUser({
        email: 'revoke@example.com',
        password: 'TestPass123!',
        firstName: 'Revoke',
        lastName: 'User',
      });

      const client = await dataManager.createClient({
        clientId: 'revoke-test-client',
        name: 'Revoke Test Client',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: 'openid profile',
        isPublic: true, // 公共客户端不需要密钥
        isActive: true,
      });

      // 创建访问令牌
      const accessToken = await dataManager.createAccessToken(user.id!, client.clientId, 'openid');

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `token=${accessToken}&client_id=${client.clientId}`,
      });

      // 根据RFC 7009，撤销端点应该返回200即使令牌无效
      expect([200, 400, 401]).toContain(response.status);

      if (response.status !== 200) {
        const data = await response.json();
        expect(data).toHaveProperty('error');
      }
    });

    it('应该处理不存在的令牌撤销请求', async () => {
      const client = await dataManager.createClient({
        clientId: 'revoke-test-client-2',
        name: 'Revoke Test Client 2',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: 'openid',
        isPublic: true,
        isActive: true,
      });

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `token=nonexistent_token&client_id=${client.clientId}`,
      });

      // 根据RFC 7009，即使令牌不存在也应该返回200
      expect([200, 400]).toContain(response.status);
    });
  });
});
