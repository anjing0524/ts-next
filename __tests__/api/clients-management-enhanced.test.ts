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

describe('OAuth2.1 客户端管理API测试 / OAuth2.1 Client Management API Tests', () => {
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

  describe('POST /api/clients - 客户端注册 / Client Registration', () => {
    it('TC_CME_001_001: 应成功注册机密客户端 / Should successfully register a confidential client', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken( // Assuming admin token is needed for client registration endpoint
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

    it('TC_CME_001_002: 应成功注册公共客户端（无客户端密钥）/ Should successfully register a public client (no client secret)', async () => {
      const clientData = {
        name: 'Test Public SPA Client',
        redirectUris: ['http://localhost:3000/callback'], // Valid URI for public client
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        scope: ['openid', 'profile'],
        isPublic: true,
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);

      const client = await response.json();
      expect(client.clientId).toBeDefined();
      expect(client.clientSecret).toBeNull(); // Public clients must not have a secret stored
      expect(client.isPublic).toBe(true);
    });

    it('TC_CME_001_003: 应拒绝无效的重定向URI / Should reject invalid redirect URIs', async () => {
      const clientData = {
        name: 'Invalid Redirect Client',
        redirectUris: ['invalid-uri', 'not-a-url'], // Malformed URIs
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

    it('TC_CME_001_004: 应拒绝不支持的授权类型 / Should reject unsupported grant types', async () => {
      const clientData = {
        name: 'Invalid Grant Type Client',
        redirectUris: ['https://app.example.com/callback'],
        grantTypes: ['unsupported_grant_type_value'], // Non-standard grant type
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

    it('TC_CME_001_005: 应拒绝缺少必需字段的请求 / Should reject requests missing required fields', async () => {
      const clientData = {
        name: 'Incomplete Client',
        // Missing redirectUris, grantTypes, etc.
      };

      const response = await httpClient.registerClient(clientData);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);

      const error = await response.json();
      expect(error.error).toBe('invalid_request'); // General error for missing fields
    });

    it('TC_CME_001_006: 应验证作用域的有效性 / Should validate scope validity', async () => {
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
      expect(error.error).toBe('invalid_scope'); // Specific error for invalid scope
    });
  });

  describe('GET /api/clients - 客户端列表查询 / Client List Retrieval', () => {
    it('TC_CME_002_001: 管理员应能获取所有客户端列表 / Admin should retrieve list of all clients', async () => {
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
      expect(Array.isArray(clients.clients)).toBe(true); // Assuming API returns { clients: [], pagination: {} }
      expect(clients.clients.length).toBeGreaterThanOrEqual(3);

      clients.clients.forEach((client: any) => {
        expect(client.clientId).toBeDefined();
        expect(client.name).toBeDefined();
        expect(client.isPublic).toBeDefined();
        expect(client.isActive).toBeDefined();
        expect(client.clientSecret).toBeUndefined(); // Client secret should not be listed
      });
    });

    it('TC_CME_002_002: 应支持分页查询 / Should support pagination', async () => {
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

    it('TC_CME_002_003: 应支持按状态筛选客户端 / Should support filtering clients by status', async () => {
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

      const result = await response.json(); // Assuming it returns { clients: [] }
      result.clients.forEach((client: any) => {
        expect(client.isActive).toBe(true);
      });
    });

    it('TC_CME_002_004: 应拒绝非管理员用户的访问 / Should reject access for non-admin users', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile'); // Non-admin scope

      const response = await httpClient.authenticatedRequest('/api/clients', userToken);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      const error = await response.json();
      expect(error.error).toBe('insufficient_scope');
    });
  });

  describe('GET /api/clients/[clientId] - 客户端详情查询 / Client Details Retrieval', () => {
    it('TC_CME_003_001: 应返回指定客户端的详细信息 / Should return detailed information for a specific client', async () => {
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
      expect(clientDetails.scope).toEqual(JSON.parse(client.scope as string)); // Assuming scope is stored as JSON string

      if (!client.isPublic) {
        // Admin should see a representation of the secret, perhaps a masked version or an indicator it exists
        // For this test, we'll assume the API might return the hashed secret or a specific placeholder.
        // The original test implies clientDetails.clientSecret would be defined.
        expect(clientDetails.clientSecret).toBeDefined();
      }
    });

    it('TC_CME_003_002: 应拒绝查询不存在的客户端 / Should reject query for a non-existent client', async () => {
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

    it('TC_CME_003_003: 客户端应能查询自身信息 / Client should be able to retrieve its own information', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL');

      const tokenResponse = await httpClient.requestToken({
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: client.plainSecret!,
        scope: 'client:read', // Assuming a scope like 'client:read' for this
      });

      expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const tokens = await tokenResponse.json();

      const response = await httpClient.getClient(client.clientId, tokens.access_token);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const clientDetails = await response.json();
      expect(clientDetails.clientId).toBe(client.clientId);
      expect(clientDetails.clientSecret).toBeUndefined(); // Client should not get its own secret this way
    });
  });

  describe('PUT /api/clients/[clientId] - 客户端信息更新 / Client Information Update', () => {
    it('TC_CME_004_001: 应成功更新客户端信息 / Should successfully update client information', async () => {
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

    it('TC_CME_004_002: 应拒绝更新不存在的客户端 / Should reject update for a non-existent client', async () => {
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

    it('TC_CME_004_003: 应验证更新数据的有效性 / Should validate validity of update data', async () => {
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
      expect(error.error).toBe('invalid_request'); // Or more specific errors for redirectUris/grantTypes
    });

    it('TC_CME_004_004: 应防止更新敏感字段（如clientId）/ Should prevent update of sensitive fields (e.g., clientId)', async () => {
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

  describe('DELETE /api/clients/[clientId] - 客户端删除 / Client Deletion', () => {
    it('TC_CME_005_001: 应成功删除客户端 / Should successfully delete a client', async () => {
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

    it('TC_CME_005_002: 删除客户端时应撤销所有相关令牌 / Should revoke all associated tokens when deleting a client', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const clientDbId = (await prisma.client.findUnique({where: {clientId: client.clientId}}))!.id;


      const accessToken = await dataManager.createAccessToken(user.id!, clientDbId, 'openid profile');
      // refreshToken creation might need clientDbId if your dataManager uses it. Assuming client.id is the DB id.
      // const refreshToken = await dataManager.createRefreshToken(user.id!, client.id!, 'openid offline_access');


      const adminToken = await dataManager.createAccessToken(admin.id!, 'admin-client', 'admin:clients');

      const deleteResponse = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(deleteResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.NO_CONTENT);

      const userinfoResponse = await httpClient.getUserInfo(accessToken);
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      // Add check for refresh token if created and if a mechanism to test its validity exists
    });

    it('TC_CME_005_003: 应拒绝删除不存在的客户端 / Should reject deletion of a non-existent client', async () => {
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

    it('TC_CME_005_004: 非管理员用户应被拒绝删除客户端 / Non-admin user should be rejected from deleting a client', async () => {
      const user = await dataManager.createTestUser('REGULAR');
      const client = await dataManager.createTestClient('CONFIDENTIAL');
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile'); // Non-admin scope

      const response = await httpClient.makeRequest(`/api/clients/${client.clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('POST /api/clients/[clientId]/regenerate-secret - 客户端密钥重新生成 / Client Secret Regeneration', () => {
    it('TC_CME_006_001: 应成功重新生成机密客户端的密钥 / Should successfully regenerate secret for a confidential client', async () => {
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

      expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // Old secret should not work
    });

    it('TC_CME_006_002: 应拒绝为公共客户端重新生成密钥 / Should reject secret regeneration for a public client', async () => {
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

  describe('安全性和权限测试 / Security and Permission Tests', () => {
    it('TC_CME_007_001: 应验证客户端管理操作的管理员权限 / Should verify admin permissions for client management operations', async () => {
      const user = await dataManager.createTestUser('REGULAR'); // Non-admin user
      const userToken = await dataManager.createAccessToken(user.id!, 'user-client', 'profile'); // Non-admin scope

      const clientData = {
        name: 'Unauthorized Client Attempt', redirectUris: ['https://app.example.com/callback'], grantTypes: ['authorization_code'],
        responseTypes: ['code'], scope: ['openid'], isPublic: false,
      };

      const response = await httpClient.makeRequest('/api/clients', { // Attempt to register client
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
    });

    it('TC_CME_007_002: 应能抵御基本的SQL注入尝试 / Should defend against basic SQL injection attempts', async () => {
      const admin = await dataManager.createTestUser('ADMIN');
      const adminToken = await dataManager.createAccessToken(
        admin.id!,
        'admin-client',
        'admin:clients'
      );

      const maliciousClientId = "'; DROP TABLE clients; --";

      const response = await httpClient.getClient(maliciousClientId, adminToken);

      // 应该安全地处理恶意输入
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND); // Or potentially BAD_REQUEST if input format is rejected earlier
    });

    it('TC_CME_007_003: 应限制客户端名称长度 / Should limit client name length', async () => {
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

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST); // Assuming validation catches this
    });
  });

  describe('性能和并发测试 / Performance and Concurrency Tests', () => {
    it('TC_CME_008_001: 应处理并发的客户端创建请求 / Should handle concurrent client creation requests', async () => {
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
