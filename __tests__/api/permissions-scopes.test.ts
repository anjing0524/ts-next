import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TestAssertions, TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG

describe('权限和作用域管理API测试 / Permissions and Scopes Management API Tests', () => {
  let httpClient: TestHttpClient;
  let dataManager: TestDataManager;
  let assertions: TestAssertions;
  let adminUser: any;
  let regularUser: any;
  let adminToken: any;
  let userToken: any;

  beforeEach(async () => {
    httpClient = new TestHttpClient();
    dataManager = new TestDataManager();
    assertions = new TestAssertions();

    await dataManager.clearDatabase();

    // 创建测试用户
    adminUser = await dataManager.createTestUser('ADMIN');

    regularUser = await dataManager.createTestUser('REGULAR');

    // 创建管理员客户端和令牌
    const adminClient = await dataManager.createTestClient({
      clientId: 'admin-permissions-client',
      clientSecret: 'admin-permissions-secret',
      clientType: 'confidential',
      redirectUris: ['https://admin.example.com/callback'],
      allowedScopes: ['admin:permissions', 'admin:scopes', 'admin:read', 'admin:write'],
    });

    adminToken = await dataManager.createAccessToken(
      adminUser.id!,
      adminClient.clientId,
      'admin:permissions admin:scopes admin:read admin:write'
    );

    // 创建普通用户客户端和令牌
    const userClient = await dataManager.createTestClient({
      clientId: 'user-permissions-client',
      clientSecret: 'user-permissions-secret',
      clientType: 'confidential',
      redirectUris: ['https://user.example.com/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read'],
    });

    userToken = await dataManager.createAccessToken(
      regularUser.id!,
      userClient.clientId,
      'openid profile email api:read'
    );
  });

  afterEach(async () => {
    await dataManager.clearDatabase();
  });

  describe('GET /api/scopes - 获取作用域列表 / Get Scopes List', () => {
    beforeEach(async () => {
      await dataManager.createTestScope({
        name: 'openid',
        description: 'OpenID Connect基础作用域',
        category: 'identity',
        isDefault: true,
      });

      await dataManager.createTestScope({
        name: 'profile',
        description: '用户基本资料访问',
        category: 'identity',
        isDefault: true,
      });

      await dataManager.createTestScope({
        name: 'api:read',
        description: 'API只读访问权限',
        category: 'api',
        isDefault: false,
      });

      await dataManager.createTestScope({
        name: 'api:write',
        description: 'API写入访问权限',
        category: 'api',
        isDefault: false,
        requiresAdmin: true,
      });

      await dataManager.createTestScope({
        name: 'admin:full',
        description: '管理员完全访问权限',
        category: 'admin',
        isDefault: false,
        requiresAdmin: true,
        isSensitive: true,
      });
    });

    describe('正常流程测试 / Normal Flow Tests', () => {
      it('TC_PS_001_001: 应返回分页的作用域列表 / Should return a paginated list of scopes', async () => {
        const response = await httpClient.get('/api/scopes?page=1&limit=10', {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        expect(response.data).toMatchObject({
          scopes: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              description: expect.any(String),
              category: expect.any(String),
              isDefault: expect.any(Boolean),
              requiresAdmin: expect.any(Boolean),
              createdAt: expect.any(String),
            }),
          ]),
          pagination: {
            page: 1,
            limit: 10,
            total: expect.any(Number),
            totalPages: expect.any(Number),
          },
        });
      });

      it('TC_PS_001_002: 应支持按类别过滤作用域 / Should support filtering scopes by category', async () => {
        const response = await httpClient.get('/api/scopes?category=identity', {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.category).toBe('identity');
        });
      });

      it('TC_PS_001_003: 应支持按默认状态过滤作用域 / Should support filtering scopes by default status', async () => {
        const response = await httpClient.get('/api/scopes?isDefault=true', {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.isDefault).toBe(true);
        });
      });

      it('TC_PS_001_004: 普通用户应只能看到非敏感作用域 / Regular users should only see non-sensitive scopes', async () => {
        const response = await httpClient.get('/api/scopes', {
          headers: { Authorization: `Bearer ${userToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.isSensitive).not.toBe(true);
        });
      });

      it('TC_PS_001_005: 应支持作用域名称搜索 / Should support searching scopes by name', async () => {
        const response = await httpClient.get('/api/scopes?search=api', {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.name).toContain('api');
        });
      });
    });

    describe('异常处理测试 / Exception Handling Tests', () => {
      it('TC_PS_001_006: 应拒绝未授权的请求 / Should reject unauthorized requests', async () => {
        const response = await httpClient.get('/api/scopes');

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN); // More specific than 'unauthorized'
        expect(response.data.error_description).toContain('Missing or invalid access token');
      });

      it('TC_PS_001_007: 应处理无效的分页参数 / Should handle invalid pagination parameters', async () => {
        const response = await httpClient.get('/api/scopes?page=0&limit=-1', { // Invalid page/limit
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(response.data.error_description).toContain('Invalid pagination parameters');
      });
    });
  });

  describe('POST /api/scopes - 创建作用域 / Create Scope', () => {
    describe('正常流程测试 / Normal Flow Tests', () => {
      it('TC_PS_002_001: 应成功创建新的作用域 / Should successfully create a new scope', async () => {
        const scopeData = {
          name: 'api:admin-new', // Unique name
          description: 'API管理员访问权限',
          category: 'api',
          isDefault: false,
          requiresAdmin: true,
          resources: ['users', 'clients', 'tokens'],
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
        expect(response.data).toMatchObject({
          id: expect.any(String),
          name: scopeData.name, // Ensure name is unique for re-runs
          description: scopeData.description,
          category: scopeData.category,
          isDefault: scopeData.isDefault,
          requiresAdmin: scopeData.requiresAdmin,
          resources: scopeData.resources,
          createdAt: expect.any(String),
        });
      });

      it('TC_PS_002_002: 应支持创建标准OpenID Connect作用域 / Should support creation of standard OpenID Connect scopes', async () => {
        const scopeData = {
          name: 'address', // Standard OIDC scope
          description: '用户地址信息访问',
          category: 'identity',
          isDefault: false,
          standard: 'openid_connect',
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
        expect(response.data.standard).toBe('openid_connect');
      });

      it('TC_PS_002_003: 应自动验证作用域名称格式 / Should automatically validate scope name format', async () => {
        const scopeData = {
          name: 'valid:scope-name123', // Adjusted to be valid and unique
          description: '有效的作用域名称格式',
          category: 'custom',
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: { Authorization: `Bearer ${adminToken.token}` },
        });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
      });
    });

    describe('异常处理测试 / Exception Handling Tests', () => {
      it('TC_PS_002_004: 应拒绝无效的作用域名称 / Should reject invalid scope names', async () => {
        const invalidNames = [ 'invalid name', 'invalid.name', 'invalid@name', 'INVALID-NAME', '123invalid', 'a', 'a'.repeat(101) ];
        for (const name of invalidNames) {
          const response = await httpClient.post('/api/scopes', { name, description: 'Test', category: 'test' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });
          expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
          expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_SCOPE_NAME);
        }
      });

      it('TC_PS_002_005: 应拒绝重复的作用域名称 / Should reject duplicate scope names', async () => {
        const scopeName = 'duplicate:test-scope';
        await httpClient.post('/api/scopes', { name: scopeName, description: 'Initial', category: 'test' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });
        const response = await httpClient.post('/api/scopes', { name: scopeName, description: 'Duplicate', category: 'test' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.SCOPE_ALREADY_EXISTS);
        expect(response.data.error_description).toContain('already exists');
      });

      it('TC_PS_002_006: 普通用户应被拒绝创建管理员作用域 / Regular users should be rejected from creating admin scopes', async () => {
        const scopeData = { name: 'admin:dangerous-attempt', description: 'Attempt by non-admin', category: 'admin', requiresAdmin: true };
        const response = await httpClient.post('/api/scopes', scopeData, { headers: { Authorization: `Bearer ${userToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_PRIVILEGES); // Or INSUFFICIENT_SCOPE depending on middleware
        expect(response.data.error_description).toContain('Cannot create admin scope');
      });

      it('TC_PS_002_007: 应拒绝缺少必需字段的请求 / Should reject requests missing required fields', async () => {
        const response = await httpClient.post('/api/scopes', { name: 'incomplete:scope-fields' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(response.data.error_description).toContain('Missing required fields');
      });

      it('TC_PS_002_008: 应拒绝未授权的请求 / Should reject unauthorized requests', async () => {
        const response = await httpClient.post('/api/scopes', { name: 'unauth:scope', description: 'Unauthorized', category: 'test' });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      });
    });

    describe('安全验证测试 / Security Validation Tests', () => {
      it('TC_PS_002_009: 应防止创建危险的系统级作用域 / Should prevent creation of dangerous system-level scopes', async () => {
        const dangerousScopes = ['system:root', 'system:admin', 'debug:all', 'super:user'];
        for (const scopeName of dangerousScopes) {
          const response = await httpClient.post('/api/scopes', { name: scopeName, description: 'Dangerous', category: 'system' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });
          expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
          expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.DANGEROUS_SCOPE);
        }
      });

      it('TC_PS_002_010: 应验证作用域描述中的XSS防护 / Should validate XSS protection in scope description', async () => {
        const scopeData = { name: 'xss:test-scope', description: '<script>alert("XSS")</script> XSS attempt', category: 'test' };
        const response = await httpClient.post('/api/scopes', scopeData, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
        expect(response.data.description).not.toContain('<script>');
      });
    });
  });

  describe('PUT /api/scopes/{scopeName} - 更新作用域 / Update Scope', () => {
    let testScope: any;

    beforeEach(async () => {
      testScope = await dataManager.createTestScope({ name: 'update:test-scope', description: 'Initial', category: 'test' });
    });

    describe('正常流程测试 / Normal Flow Tests', () => {
      it('TC_PS_003_001: 应成功更新作用域信息 / Should successfully update scope information', async () => {
        const updateData = { description: 'Updated Description', category: 'updated-cat', requiresAdmin: true, resources: ['res1', 'res2'] };
        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        expect(response.data).toMatchObject({
          name: testScope.name, description: updateData.description, category: updateData.category,
          requiresAdmin: updateData.requiresAdmin, resources: updateData.resources, updatedAt: expect.any(String),
        });
      });

      it('TC_PS_003_002: 应支持部分更新 / Should support partial updates', async () => {
        const updateData = { description: 'Partially Updated Description' };
        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        expect(response.data.description).toBe(updateData.description);
        expect(response.data.category).toBe(testScope.category); // Should remain unchanged
      });
    });

    describe('异常处理测试 / Exception Handling Tests', () => {
      it('TC_PS_003_003: 应处理不存在的作用域 / Should handle non-existent scope', async () => {
        const response = await httpClient.put('/api/scopes/non-existent-scope', { description: 'No such scope' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.SCOPE_NOT_FOUND);
        expect(response.data.error_description).toBe('Scope not found');
      });

      it('TC_PS_003_004: 应防止危险的权限提升 / Should prevent dangerous permission escalation', async () => {
        const updateData = { requiresAdmin: true, category: 'admin', isSensitive: true };
        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, { headers: { Authorization: `Bearer ${userToken.token}` } }); // User token

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_PRIVILEGES);
        expect(response.data.error_description).toContain('Cannot modify admin scope properties');
      });

      it('TC_PS_003_005: 应保护标准OpenID Connect作用域 / Should protect standard OpenID Connect scopes', async () => {
        const standardScope = await dataManager.createTestScope({ name: 'openid', description: 'Standard', category: 'identity', standard: 'openid_connect', isProtected: true });
        const response = await httpClient.put(`/api/scopes/${standardScope.name}`, { description: 'Attempted modification' }, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.PROTECTED_SCOPE);
        expect(response.data.error_description).toContain('Cannot modify protected scope');
      });
    });
  });

  describe('DELETE /api/scopes/{scopeName} - 删除作用域 / Delete Scope', () => {
    let testScope: any;

    beforeEach(async () => {
      testScope = await dataManager.createTestScope({ name: 'delete:test-scope', description: 'To be deleted', category: 'test' });
    });

    describe('正常流程测试 / Normal Flow Tests', () => {
      it('TC_PS_004_001: 应成功删除作用域 / Should successfully delete a scope', async () => {
        const response = await httpClient.delete(`/api/scopes/${testScope.name}`, { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NO_CONTENT);

        const getResponse = await httpClient.get(`/api/scopes/${testScope.name}`, { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(getResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      });

      it('TC_PS_004_002: 删除作用域时应更新相关客户端配置 / Should update related client configurations when deleting a scope', async () => {
        const client = await dataManager.createTestClient({ clientId: 'scope-delete-client-ps', allowedScopes: ['openid', 'profile', testScope.name] });
        await httpClient.delete(`/api/scopes/${testScope.name}`, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        const clientResponse = await httpClient.get(`/api/clients/${client.clientId}`, { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(clientResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        // Assuming allowedScopes is returned as an array of strings
        const updatedClientScopes = Array.isArray(clientResponse.data.scope) ? clientResponse.data.scope : JSON.parse(clientResponse.data.scope || "[]");
        expect(updatedClientScopes).not.toContain(testScope.name);
      });
    });

    describe('异常处理测试 / Exception Handling Tests', () => {
      it('TC_PS_004_003: 应处理不存在的作用域 / Should handle non-existent scope', async () => {
        const response = await httpClient.delete('/api/scopes/non-existent-scope-del', { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      });

      it('TC_PS_004_004: 应拒绝删除被使用的作用域（除非强制）/ Should reject deletion of scope in use (unless forced)', async () => {
        await dataManager.createAccessToken(regularUser.id!, 'user-permissions-client', `openid profile ${testScope.name}`);
        const response = await httpClient.delete(`/api/scopes/${testScope.name}?force=false`, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CONFLICT); // 409 Conflict
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.SCOPE_IN_USE);
        expect(response.data.error_description).toContain('Scope is currently in use');
        expect(response.data.activeTokens).toBeGreaterThanOrEqual(1);
      });

      it('TC_PS_004_005: 应拒绝删除受保护的标准作用域 / Should reject deletion of protected standard scopes', async () => {
        const protectedScope = await dataManager.createTestScope({ name: 'openid', description: 'Standard', category: 'identity', standard: 'openid_connect', isProtected: true });
        const response = await httpClient.delete(`/api/scopes/${protectedScope.name}`, { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
        expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.PROTECTED_SCOPE);
        expect(response.data.error_description).toContain('Cannot delete protected scope');
      });
    });
  });

  describe('GET /api/permissions - 获取权限列表 / Get Permissions List', () => {
    beforeEach(async () => {
      await dataManager.createTestPermission({
        name: 'users:read',
        description: '读取用户信息', // Read user information
        resource: 'users',
        action: 'read',
      });

      await dataManager.createTestPermission({
        name: 'users:write',
        description: '修改用户信息',
        resource: 'users',
        action: 'write',
      });

      await dataManager.createTestPermission({
        name: 'clients:admin',
        description: '管理客户端',
        resource: 'clients',
        action: 'admin',
        requiresAdmin: true,
      });
    });

    describe('正常流程测试 / Normal Flow Tests', () => {
      it('TC_PS_005_001: 应返回分页的权限列表 / Should return a paginated list of permissions', async () => {
        const response = await httpClient.get('/api/permissions?page=1&limit=10', { headers: { Authorization: `Bearer ${adminToken.token}` } });

        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        expect(response.data).toMatchObject({
          permissions: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              description: expect.any(String),
              resource: expect.any(String),
              action: expect.any(String),
              requiresAdmin: expect.any(Boolean),
              createdAt: expect.any(String),
            }),
          ]),
          pagination: expect.any(Object),
        });
      });

      it('TC_PS_005_002: 应支持按资源类型过滤权限 / Should support filtering permissions by resource type', async () => {
        const response = await httpClient.get('/api/permissions?resource=users', { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.resource).toBe('users');
        });
      });

      it('TC_PS_005_003: 应支持按操作类型过滤权限 / Should support filtering permissions by action type', async () => {
        const response = await httpClient.get('/api/permissions?action=read', { headers: { Authorization: `Bearer ${adminToken.token}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.action).toBe('read');
        });
      });

      it('TC_PS_005_004: 普通用户应只能看到非管理员权限 / Regular users should only see non-admin permissions', async () => {
        const response = await httpClient.get('/api/permissions', { headers: { Authorization: `Bearer ${userToken.token}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.requiresAdmin).not.toBe(true);
        });
      });
    });
  });

  describe('🔒 权限验证中间件测试 / Permission Validation Middleware Tests', () => {
    it('TC_PS_006_001: 应正确验证作用域权限 / Should correctly validate scope permissions', async () => {
      const response = await httpClient.get('/api/admin/sensitive-data', { headers: { Authorization: `Bearer ${userToken.token}` } }); // Lacks 'admin' scope

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_SCOPE);
      expect(response.data.error_description).toContain('Required scope: admin');
    });

    it('TC_PS_006_002: 应支持多作用域OR验证 / Should support OR validation for multiple scopes', async () => {
      const limitedAdminToken = await dataManager.createAccessToken(adminUser.id!, 'admin-permissions-client', 'admin:read'); // Only read
      const response = await httpClient.get('/api/admin/read-only-data', { headers: { Authorization: `Bearer ${limitedAdminToken.token}` } });
      // Assuming /api/admin/read-only-data requires 'admin:read' OR 'admin:write'
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });

    it('TC_PS_006_003: 应支持作用域层级验证 / Should support scope hierarchy validation', async () => {
      const readOnlyToken = await dataManager.createAccessToken(regularUser.id!, 'user-permissions-client', 'api:read');
      const writeResponse = await httpClient.post('/api/data', { test: 'data' }, { headers: { Authorization: `Bearer ${readOnlyToken.token}` } });
      // Assuming /api/data POST requires 'api:write' which is higher than 'api:read'
      expect(writeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      expect(writeResponse.data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_SCOPE);
    });

    it('TC_PS_006_004: 应正确处理作用域继承 / Should correctly handle scope inheritance', async () => {
      const adminApiToken = await dataManager.createAccessToken(adminUser.id!, 'admin-permissions-client', 'api:admin'); // api:admin should include api:read and api:write

      const readResponse = await httpClient.get('/api/data', { headers: { Authorization: `Bearer ${adminApiToken.token}` } });
      expect(readResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

      const writeResponse = await httpClient.post('/api/data', { test: 'data' }, { headers: { Authorization: `Bearer ${adminApiToken.token}` } });
      expect(writeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
    });
  });

  describe('🔄 作用域动态验证测试 / Dynamic Scope Validation Tests', () => {
    it('TC_PS_007_001: 作用域更新后令牌权限应该实时生效 / Token permissions should reflect scope updates in real-time', async () => {
      const dynamicScope = await dataManager.createTestScope({ name: 'dynamic:test-scope', description: 'Dynamic', category: 'test', resources: ['test-resource'] });
      const dynamicToken = await dataManager.createAccessToken(regularUser.id!, 'user-permissions-client', `openid profile ${dynamicScope.name}`);

      let response = await httpClient.get('/api/test-resource', { headers: { Authorization: `Bearer ${dynamicToken.token}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // Initial access

      await httpClient.put(`/api/scopes/${dynamicScope.name}`, { resources: [] }, { headers: { Authorization: `Bearer ${adminToken.token}` } }); // Remove resource from scope

      response = await httpClient.get('/api/test-resource', { headers: { Authorization: `Bearer ${dynamicToken.token}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN); // Access should now be denied
    });

    it('TC_PS_007_002: 应正确处理作用域依赖关系 / Should correctly handle scope dependencies', async () => {
      const parentScope = await dataManager.createTestScope({ name: 'parent:scope-dep', description: 'Parent', category: 'hierarchy' });
      const childScope = await dataManager.createTestScope({ name: 'child:scope-dep', description: 'Child', category: 'hierarchy', dependencies: [parentScope.name] });
      const childOnlyToken = await dataManager.createAccessToken(regularUser.id!, 'user-permissions-client', childScope.name);

      // Assuming /api/parent-resource requires 'parent:scope-dep'
      const response = await httpClient.get('/api/parent-resource', { headers: { Authorization: `Bearer ${childOnlyToken.token}` } });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      expect(response.data.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_SCOPE);
      expect(response.data.error_description).toContain('Required parent scope');
    });
  });
});
