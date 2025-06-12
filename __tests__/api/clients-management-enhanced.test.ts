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

describe('OAuth2.1 Client Management API Tests', () => {
  const httpClient = new TestHttpClient();
  const dataManager = new TestDataManager();
  const { setup, cleanup } = createTestSetup('clients-management-enhanced');

  beforeEach(async () => {
    await setup();
    await dataManager.setupBasicScopes();
  });

  afterEach(async () => {
    await dataManager.cleanup();
    await cleanup();
  });

  describe('POST /api/clients - 客户端注册', () => {
    it('应该成功注册机密客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const clientData = {
        name: 'Test Confidential Client',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        scope: ['openid', 'profile', 'email'],
        isPublic: false,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);

      const client = await response.json();
      expect(client.clientId).toBeDefined();
      expect(client.clientSecret).toBeDefined();
      expect(client.name).toBe(clientData.name);
      expect(client.isPublic).toBe(false);
      expect(client.isActive).toBe(true);
      expect(client.redirectUris).toEqual(clientData.redirectUris);
      expect(client.grantTypes).toEqual(clientData.grantTypes);
    });

    it('应该成功注册公共客户端（无客户端密钥）', async () => {
      const clientData = {
        name: 'Test Public SPA Client',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid', 'profile'],
        isPublic: true,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);

      const client = await response.json();
      expect(client.clientId).toBeDefined();
      expect(client.clientSecret).toBeNull();
      expect(client.isPublic).toBe(true);
    });

    it('应该拒绝无效的重定向URI', async () => {
      const clientData = {
        name: 'Invalid Redirect Client',
        redirectUris: ['invalid-uri', 'not-a-url'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid'],
        isPublic: true,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request');
      expect(error.error_description).toContain('redirect_uri');
    });

    it('应该拒绝不支持的授权类型', async () => {
      const clientData = {
        name: 'Invalid Grant Type Client',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['unsupported_grant_type'],
        responseTypes: ['code'],
        scope: ['openid'],
        isPublic: false,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request');
      expect(error.error_description).toContain('grant_type');
    });

    it('应该拒绝缺少必需字段的请求', async () => {
      const clientData = {
        name: 'Incomplete Client',
        // 缺少redirectUris, grantTypes等必需字段
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request');
    });

    it('应该验证作用域的有效性', async () => {
      const clientData = {
        name: 'Invalid Scope Client',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid', 'invalid_scope', 'another_invalid_scope'],
        isPublic: false,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_scope');
    });
  });

  describe('GET /api/clients - 客户端列表查询', () => {
    it('应该返回管理员可见的所有客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      // 创建几个测试客户端
      await dataManager.createTestClient('CONFIDENTIAL');
      await dataManager.createTestClient('PUBLIC');
      await dataManager.createTestClient('WEB_APP');

      const response = await httpClient.authenticatedRequest('/api/clients', adminToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const clients = await response.json();
      expect(Array.isArray(clients)).toBe(true);
      expect(clients.length).toBeGreaterThanOrEqual(3);

      // 验证返回的客户端信息不包含敏感数据
      clients.forEach((client: any) => {
        expect(client.clientId).toBeDefined();
        expect(client.name).toBeDefined();
        expect(client.isPublic).toBeDefined();
        expect(client.isActive).toBeDefined();
        // 客户端密钥不应该在列表中返回
        expect(client.clientSecret).toBeUndefined();
      });
    });

    it('应该支持分页查询', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const response = await httpClient.authenticatedRequest(
        '/api/clients?page=1&limit=10',
        adminToken
      );

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const result = await response.json();
      expect(result.clients).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('应该支持按状态筛选客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const response = await httpClient.authenticatedRequest(
        '/api/clients?status=active',
        adminToken
      );

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const clients = await response.json();
      clients.forEach((client: any) => {
        expect(client.isActive).toBe(true);
      });
    });

    it('应该拒绝非管理员用户的访问', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile');

      const response = await httpClient.authenticatedRequest('/api/clients', userToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);

      const error = await response.json();
      expect(error.error).toBe('insufficient_scope');
    });
  });

  describe('GET /api/clients/[clientId] - 客户端详情查询', () => {
    it('应该返回指定客户端的详细信息', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const response = await httpClient.getClient(client.clientId, adminToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const clientDetails = await response.json();
      expect(clientDetails.clientId).toBe(client.clientId);
      expect(clientDetails.name).toBe(client.name);
      expect(clientDetails.redirectUris).toEqual(client.redirectUris);
      expect(clientDetails.grantTypes).toEqual(client.grantTypes);
      expect(clientDetails.scope).toEqual(client.scope);

      // 管理员应该能看到客户端密钥（如果是机密客户端）
      if (!client.isPublic) {
        expect(clientDetails.clientSecret).toBeDefined();
      }
    });

    it('应该拒绝查询不存在的客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const response = await httpClient.getClient('non-existent-client', adminToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);

      const error = await response.json();
      expect(error.error).toBe('client_not_found');
    });

    it('应该允许客户端查询自己的信息', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      // 使用客户端凭证获取令牌
      const tokenResponse = await httpClient.requestToken({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: client.plainSecret,
        scope: 'client:read',
      });

      expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const tokens = await tokenResponse.json();

      const response = await httpClient.getClient(client.clientId, tokens.access_token);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const clientDetails = await response.json();
      expect(clientDetails.clientId).toBe(client.clientId);
      // 客户端查询自己时不应该返回密钥
      expect(clientDetails.clientSecret).toBeUndefined();
    });
  });

  describe('PUT /api/clients/[clientId] - 客户端信息更新', () => {
    it('应该成功更新客户端信息', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const updateData = {
        name: 'Updated Client Name',
        redirectUris: ['https://updated.example.com/callback'],
        scope: ['openid', 'profile'],
      };

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const updatedClient = await response.json();
      expect(updatedClient.name).toBe(updateData.name);
      expect(updatedClient.redirectUris).toEqual(updateData.redirectUris);
      expect(updatedClient.scope).toEqual(updateData.scope);
    });

    it('应该拒绝更新不存在的客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const updateData = {
        name: 'Updated Name',
      };

      const response = await httpClient.makeRequest('/api/clients/non-existent', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
    });

    it('应该验证更新数据的有效性', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const invalidUpdateData = {
        redirectUris: ['invalid-uri'],
        grantTypes: ['unsupported_grant'],
      };

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidUpdateData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request');
    });

    it('应该防止更新敏感字段（如clientId）', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const originalClientId = client.clientId;

      const updateData = {
        clientId: 'new-client-id',
        name: 'Updated Name',
      };

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const updatedClient = await response.json();
      // clientId不应该被更改
      expect(updatedClient.clientId).toBe(originalClientId);
      expect(updatedClient.name).toBe(updateData.name);
    });
  });

  describe('DELETE /api/clients/[clientId] - 客户端删除', () => {
    it('应该成功删除客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NO_CONTENT);

      // 验证客户端已被删除
      const getResponse = await httpClient.getClient(client.clientId, adminToken);
      expect(getResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
    });

    it('应该在删除客户端时撤销所有相关令牌', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      // 创建一些令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!,
        client.id!,
        'openid profile'
      );
      const refreshToken = await dataManager.createRefreshToken(
        user.id!,
        client.id!,
        'openid profile offline_access'
      );

      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      // 删除客户端
      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NO_CONTENT);

      // 验证令牌已被撤销
      const userinfoResponse = await httpClient.getUserInfo(accessToken);
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('应该拒绝删除不存在的客户端', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const response = await httpClient.makeRequest('/api/clients/non-existent', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
    });

    it('应该拒绝非管理员用户删除客户端', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile');

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('POST /api/clients/[clientId]/regenerate-secret - 客户端密钥重新生成', () => {
    it('应该成功重新生成机密客户端的密钥', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const originalSecret = client.plainSecret;

      const response = await httpClient.makeRequest(
        `/api/clients/${client.clientId}/regenerate-secret`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const result = await response.json();
      expect(result.clientSecret).toBeDefined();
      expect(result.clientSecret).not.toBe(originalSecret);

      // 验证旧密钥不再有效
      const tokenResponse = await httpClient.requestToken({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: originalSecret,
      });

      expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('应该拒绝为公共客户端重新生成密钥', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const client = await dataManager.createTestClient('PUBLIC');

      const response = await httpClient.makeRequest(
        `/api/clients/${client.clientId}/regenerate-secret`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request');
      expect(error.error_description).toContain('public client');
    });
  });

  describe('安全性和权限测试', () => {
    it('应该验证管理员权限', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile');

      const clientData = {
        name: 'Unauthorized Client',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid'],
        isPublic: false,
      };

      const response = await httpClient.makeRequest('/api/clients', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
    });

    it('应该防止SQL注入攻击', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const maliciousClientId = "'; DROP TABLE clients; --";

      const response = await httpClient.getClient(maliciousClientId, adminToken);

      // 应该安全地处理恶意输入
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
    });

    it('应该限制客户端名称长度', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const clientData = {
        name: 'A'.repeat(1000), // 超长名称
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid'],
        isPublic: false,
      };

      const response = await httpClient.makeRequest('/api/clients', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('性能和并发测试', () => {
    it('应该处理并发的客户端创建请求', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const clientDataTemplate = {
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid'],
        isPublic: false,
      };

      // 并发创建多个客户端
      const promises = Array(5)
        .fill(null)
        .map((_, index) =>
          httpClient.makeRequest('/api/clients', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...clientDataTemplate,
              name: `Concurrent Client ${index}`,
            }),
          })
        );

      const responses = await Promise.all(promises);

      // 所有请求都应该成功
      responses.forEach((response) => {
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
      });

      // 验证所有客户端都有唯一的clientId
      const clients = await Promise.all(responses.map((r) => r.json()));
      const clientIds = clients.map((c) => c.clientId);
      const uniqueClientIds = new Set(clientIds);
      expect(uniqueClientIds.size).toBe(clientIds.length);
    });
  });
});
