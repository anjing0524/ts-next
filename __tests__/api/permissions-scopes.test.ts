import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TestAssertions } from '../utils/test-helpers';

describe('权限和作用域管理API测试', () => {
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

  describe('GET /api/scopes - 获取作用域列表', () => {
    beforeEach(async () => {
      // 创建一些测试作用域
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

    describe('✅ 正常流程测试', () => {
      it('应该返回分页的作用域列表', async () => {
        const response = await httpClient.get('/api/scopes?page=1&limit=10', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
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

      it('应该支持按类别过滤作用域', async () => {
        const response = await httpClient.get('/api/scopes?category=identity', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.category).toBe('identity');
        });
      });

      it('应该支持按默认状态过滤', async () => {
        const response = await httpClient.get('/api/scopes?isDefault=true', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.isDefault).toBe(true);
        });
      });

      it('普通用户应该只能看到非敏感作用域', async () => {
        const response = await httpClient.get('/api/scopes', {
          headers: {
            Authorization: `Bearer ${userToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.isSensitive).not.toBe(true);
        });
      });

      it('应该支持作用域名称搜索', async () => {
        const response = await httpClient.get('/api/scopes?search=api', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.scopes.forEach((scope: any) => {
          expect(scope.name).toContain('api');
        });
      });
    });

    describe('❌ 异常处理测试', () => {
      it('应该拒绝未授权的请求', async () => {
        const response = await httpClient.get('/api/scopes');

        expect(response.status).toBe(401);
        expect(response.data).toMatchObject({
          error: 'unauthorized',
          error_description: expect.stringContaining('Missing or invalid access token'),
        });
      });

      it('应该处理无效的分页参数', async () => {
        const response = await httpClient.get('/api/scopes?page=0&limit=-1', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(400);
        expect(response.data).toMatchObject({
          error: 'invalid_request',
          error_description: expect.stringContaining('Invalid pagination parameters'),
        });
      });
    });
  });

  describe('POST /api/scopes - 创建作用域', () => {
    describe('✅ 正常流程测试', () => {
      it('应该成功创建新的作用域', async () => {
        const scopeData = {
          name: 'api:admin',
          description: 'API管理员访问权限',
          category: 'api',
          isDefault: false,
          requiresAdmin: true,
          resources: ['users', 'clients', 'tokens'],
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(201);
        expect(response.data).toMatchObject({
          id: expect.any(String),
          name: scopeData.name,
          description: scopeData.description,
          category: scopeData.category,
          isDefault: scopeData.isDefault,
          requiresAdmin: scopeData.requiresAdmin,
          resources: scopeData.resources,
          createdAt: expect.any(String),
        });
      });

      it('应该支持创建标准OpenID Connect作用域', async () => {
        const scopeData = {
          name: 'address',
          description: '用户地址信息访问',
          category: 'identity',
          isDefault: false,
          standard: 'openid_connect',
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(201);
        expect(response.data.standard).toBe('openid_connect');
      });

      it('应该自动验证作用域名称格式', async () => {
        const scopeData = {
          name: 'valid:scope-name_123',
          description: '有效的作用域名称格式',
          category: 'custom',
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(201);
      });
    });

    describe('❌ 异常处理测试', () => {
      it('应该拒绝无效的作用域名称', async () => {
        const invalidNames = [
          'invalid name', // 包含空格
          'invalid.name', // 包含点号
          'invalid@name', // 包含特殊字符
          'INVALID-NAME', // 全大写
          '123invalid', // 以数字开头
          'a', // 太短
          'a'.repeat(100), // 太长
        ];

        for (const name of invalidNames) {
          const response = await httpClient.post(
            '/api/scopes',
            {
              name,
              description: '测试无效名称',
              category: 'test',
            },
            {
              headers: {
                Authorization: `Bearer ${adminToken.token}`,
              },
            }
          );

          expect(response.status).toBe(400);
          expect(response.data.error).toBe('invalid_scope_name');
        }
      });

      it('应该拒绝重复的作用域名称', async () => {
        // 先创建一个作用域
        await httpClient.post(
          '/api/scopes',
          {
            name: 'duplicate:test',
            description: '重复测试作用域',
            category: 'test',
          },
          {
            headers: { Authorization: `Bearer ${adminToken.token}` },
          }
        );

        // 尝试创建同名作用域
        const response = await httpClient.post(
          '/api/scopes',
          {
            name: 'duplicate:test',
            description: '另一个重复测试作用域',
            category: 'test',
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken.token}`,
            },
          }
        );

        expect(response.status).toBe(409);
        expect(response.data).toMatchObject({
          error: 'scope_already_exists',
          error_description: expect.stringContaining('already exists'),
        });
      });

      it('应该拒绝普通用户创建管理员作用域', async () => {
        const scopeData = {
          name: 'admin:dangerous',
          description: '危险的管理员作用域',
          category: 'admin',
          requiresAdmin: true,
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: {
            Authorization: `Bearer ${userToken.token}`,
          },
        });

        expect(response.status).toBe(403);
        expect(response.data).toMatchObject({
          error: 'insufficient_privileges',
          error_description: expect.stringContaining('Cannot create admin scope'),
        });
      });

      it('应该拒绝缺少必需字段的请求', async () => {
        const response = await httpClient.post(
          '/api/scopes',
          {
            name: 'incomplete:scope',
            // 缺少 description 和 category
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken.token}`,
            },
          }
        );

        expect(response.status).toBe(400);
        expect(response.data).toMatchObject({
          error: 'invalid_request',
          error_description: expect.stringContaining('Missing required fields'),
        });
      });

      it('应该拒绝未授权的请求', async () => {
        const response = await httpClient.post('/api/scopes', {
          name: 'unauthorized:scope',
          description: '未授权的作用域',
          category: 'test',
        });

        expect(response.status).toBe(401);
      });
    });

    describe('🔒 安全验证测试', () => {
      it('应该防止创建危险的系统级作用域', async () => {
        const dangerousScopes = ['system:root', 'system:admin', 'debug:all', 'super:user'];

        for (const scopeName of dangerousScopes) {
          const response = await httpClient.post(
            '/api/scopes',
            {
              name: scopeName,
              description: '危险的系统作用域',
              category: 'system',
            },
            {
              headers: {
                Authorization: `Bearer ${adminToken.token}`,
              },
            }
          );

          expect(response.status).toBe(400);
          expect(response.data.error).toBe('dangerous_scope');
        }
      });

      it('应该验证作用域描述中的XSS防护', async () => {
        const scopeData = {
          name: 'xss:test',
          description: '<script>alert("XSS")</script>作用域描述',
          category: 'test',
        };

        const response = await httpClient.post('/api/scopes', scopeData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(201);
        // 确保HTML标签被转义或移除
        expect(response.data.description).not.toContain('<script>');
      });
    });
  });

  describe('PUT /api/scopes/{scopeName} - 更新作用域', () => {
    let testScope: any;

    beforeEach(async () => {
      testScope = await dataManager.createTestScope({
        name: 'update:test',
        description: '更新测试作用域',
        category: 'test',
        isDefault: false,
        requiresAdmin: false,
      });
    });

    describe('✅ 正常流程测试', () => {
      it('应该成功更新作用域信息', async () => {
        const updateData = {
          description: '已更新的作用域描述',
          category: 'updated',
          requiresAdmin: true,
          resources: ['resource1', 'resource2'],
        };

        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({
          name: testScope.name,
          description: updateData.description,
          category: updateData.category,
          requiresAdmin: updateData.requiresAdmin,
          resources: updateData.resources,
          updatedAt: expect.any(String),
        });
      });

      it('应该支持部分更新', async () => {
        const updateData = {
          description: '部分更新的描述',
        };

        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.description).toBe(updateData.description);
        // 其他字段应该保持不变
        expect(response.data.category).toBe(testScope.category);
      });
    });

    describe('❌ 异常处理测试', () => {
      it('应该处理不存在的作用域', async () => {
        const response = await httpClient.put(
          '/api/scopes/non-existent',
          {
            description: '不存在的作用域',
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken.token}`,
            },
          }
        );

        expect(response.status).toBe(404);
        expect(response.data).toMatchObject({
          error: 'scope_not_found',
          error_description: 'Scope not found',
        });
      });

      it('应该防止危险的权限提升', async () => {
        const updateData = {
          requiresAdmin: true,
          category: 'admin',
          isSensitive: true,
        };

        const response = await httpClient.put(`/api/scopes/${testScope.name}`, updateData, {
          headers: {
            Authorization: `Bearer ${userToken.token}`,
          },
        });

        expect(response.status).toBe(403);
        expect(response.data).toMatchObject({
          error: 'insufficient_privileges',
          error_description: expect.stringContaining('Cannot modify admin scope properties'),
        });
      });

      it('应该保护标准OpenID Connect作用域', async () => {
        // 尝试修改标准作用域
        const standardScope = await dataManager.createTestScope({
          name: 'openid',
          description: 'OpenID Connect标准作用域',
          category: 'identity',
          standard: 'openid_connect',
          isProtected: true,
        });

        const response = await httpClient.put(
          `/api/scopes/${standardScope.name}`,
          {
            description: '尝试修改标准作用域',
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken.token}`,
            },
          }
        );

        expect(response.status).toBe(403);
        expect(response.data).toMatchObject({
          error: 'protected_scope',
          error_description: expect.stringContaining('Cannot modify protected scope'),
        });
      });
    });
  });

  describe('DELETE /api/scopes/{scopeName} - 删除作用域', () => {
    let testScope: any;

    beforeEach(async () => {
      testScope = await dataManager.createTestScope({
        name: 'delete:test',
        description: '删除测试作用域',
        category: 'test',
      });
    });

    describe('✅ 正常流程测试', () => {
      it('应该成功删除作用域', async () => {
        const response = await httpClient.delete(`/api/scopes/${testScope.name}`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(204);

        // 验证作用域已被删除
        const getResponse = await httpClient.get(`/api/scopes/${testScope.name}`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });
        expect(getResponse.status).toBe(404);
      });

      it('应该在删除作用域时更新相关客户端配置', async () => {
        // 创建使用该作用域的客户端
        const client = await dataManager.createTestClient({
          clientId: 'scope-delete-test-client',
          allowedScopes: ['openid', 'profile', testScope.name],
        });

        await httpClient.delete(`/api/scopes/${testScope.name}`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        // 验证客户端的作用域配置已更新
        const clientResponse = await httpClient.get(`/api/clients/${client.clientId}`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(clientResponse.data.allowedScopes).not.toContain(testScope.name);
      });
    });

    describe('❌ 异常处理测试', () => {
      it('应该处理不存在的作用域', async () => {
        const response = await httpClient.delete('/api/scopes/non-existent', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(404);
      });

      it('应该拒绝删除被使用的作用域（可选保护）', async () => {
        // 创建使用该作用域的活跃令牌
        await dataManager.createAccessToken(
          regularUser.id!,
          'user-permissions-client',
          `openid profile ${testScope.name}`
        );

        const response = await httpClient.delete(`/api/scopes/${testScope.name}?force=false`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(409);
        expect(response.data).toMatchObject({
          error: 'scope_in_use',
          error_description: expect.stringContaining('Scope is currently in use'),
          activeTokens: expect.any(Number),
        });
      });

      it('应该拒绝删除受保护的标准作用域', async () => {
        const protectedScope = await dataManager.createTestScope({
          name: 'openid',
          description: 'OpenID Connect标准作用域',
          category: 'identity',
          standard: 'openid_connect',
          isProtected: true,
        });

        const response = await httpClient.delete(`/api/scopes/${protectedScope.name}`, {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(403);
        expect(response.data).toMatchObject({
          error: 'protected_scope',
          error_description: expect.stringContaining('Cannot delete protected scope'),
        });
      });
    });
  });

  describe('GET /api/permissions - 获取权限列表', () => {
    beforeEach(async () => {
      // 创建一些测试权限
      await dataManager.createTestPermission({
        name: 'users:read',
        description: '读取用户信息',
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

    describe('✅ 正常流程测试', () => {
      it('应该返回分页的权限列表', async () => {
        const response = await httpClient.get('/api/permissions?page=1&limit=10', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
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

      it('应该支持按资源类型过滤', async () => {
        const response = await httpClient.get('/api/permissions?resource=users', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.resource).toBe('users');
        });
      });

      it('应该支持按操作类型过滤', async () => {
        const response = await httpClient.get('/api/permissions?action=read', {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.action).toBe('read');
        });
      });

      it('普通用户应该只能看到非管理员权限', async () => {
        const response = await httpClient.get('/api/permissions', {
          headers: {
            Authorization: `Bearer ${userToken.token}`,
          },
        });

        expect(response.status).toBe(200);
        response.data.permissions.forEach((permission: any) => {
          expect(permission.requiresAdmin).not.toBe(true);
        });
      });
    });
  });

  describe('🔒 权限验证中间件测试', () => {
    it('应该正确验证作用域权限', async () => {
      // 测试需要特定作用域的端点
      const response = await httpClient.get('/api/admin/sensitive-data', {
        headers: {
          Authorization: `Bearer ${userToken.token}`, // 缺少admin作用域
        },
      });

      expect(response.status).toBe(403);
      expect(response.data).toMatchObject({
        error: 'insufficient_scope',
        error_description: expect.stringContaining('Required scope: admin'),
      });
    });

    it('应该支持多作用域OR验证', async () => {
      // 创建需要多个作用域中任一个的端点测试
      const limitedAdminToken = await dataManager.createAccessToken(
        adminUser.id!,
        'admin-permissions-client',
        'admin:read' // 只有读权限，没有写权限
      );

      const response = await httpClient.get('/api/admin/read-only-data', {
        headers: {
          Authorization: `Bearer ${limitedAdminToken.token}`,
        },
      });

      expect(response.status).toBe(200);
    });

    it('应该支持作用域层级验证', async () => {
      // 测试层级作用域（如 api:read < api:write < api:admin）
      const readOnlyToken = await dataManager.createAccessToken(
        regularUser.id!,
        'user-permissions-client',
        'api:read'
      );

      // 只读令牌不应该能访问写入端点
      const writeResponse = await httpClient.post(
        '/api/data',
        { test: 'data' },
        {
          headers: {
            Authorization: `Bearer ${readOnlyToken.token}`,
          },
        }
      );

      expect(writeResponse.status).toBe(403);
      expect(writeResponse.data.error).toBe('insufficient_scope');
    });

    it('应该正确处理作用域继承', async () => {
      // 测试高级作用域是否包含低级权限
      const adminApiToken = await dataManager.createAccessToken(
        adminUser.id!,
        'admin-permissions-client',
        'api:admin' // 管理员API权限应该包含读写权限
      );

      // 管理员令牌应该能访问读取端点
      const readResponse = await httpClient.get('/api/data', {
        headers: {
          Authorization: `Bearer ${adminApiToken.token}`,
        },
      });

      expect(readResponse.status).toBe(200);

      // 管理员令牌也应该能访问写入端点
      const writeResponse = await httpClient.post(
        '/api/data',
        { test: 'data' },
        {
          headers: {
            Authorization: `Bearer ${adminApiToken.token}`,
          },
        }
      );

      expect(writeResponse.status).toBe(200);
    });
  });

  describe('🔄 作用域动态验证测试', () => {
    it('作用域更新后令牌权限应该实时生效', async () => {
      // 创建一个作用域
      const dynamicScope = await dataManager.createTestScope({
        name: 'dynamic:test',
        description: '动态测试作用域',
        category: 'test',
        resources: ['test-resource'],
      });

      // 创建使用该作用域的令牌
      const dynamicToken = await dataManager.createAccessToken(
        regularUser.id!,
        'user-permissions-client',
        `openid profile ${dynamicScope.name}`
      );

      // 初始验证令牌可以访问资源
      let response = await httpClient.get('/api/test-resource', {
        headers: {
          Authorization: `Bearer ${dynamicToken.token}`,
        },
      });
      expect(response.status).toBe(200);

      // 更新作用域，移除资源访问权限
      await httpClient.put(
        `/api/scopes/${dynamicScope.name}`,
        {
          resources: [], // 移除所有资源
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken.token}`,
          },
        }
      );

      // 验证令牌权限已实时更新
      response = await httpClient.get('/api/test-resource', {
        headers: {
          Authorization: `Bearer ${dynamicToken.token}`,
        },
      });
      expect(response.status).toBe(403);
    });

    it('应该正确处理作用域依赖关系', async () => {
      // 创建有依赖关系的作用域
      const parentScope = await dataManager.createTestScope({
        name: 'parent:scope',
        description: '父级作用域',
        category: 'hierarchy',
      });

      const childScope = await dataManager.createTestScope({
        name: 'child:scope',
        description: '子级作用域',
        category: 'hierarchy',
        dependencies: [parentScope.name],
      });

      // 创建只有子级作用域的令牌
      const childOnlyToken = await dataManager.createAccessToken(
        regularUser.id!,
        'user-permissions-client',
        childScope.name
      );

      // 验证拥有子级作用域的令牌不能访问需要父级作用域的资源
      const response = await httpClient.get('/api/parent-resource', {
        headers: {
          Authorization: `Bearer ${childOnlyToken.token}`,
        },
      });

      expect(response.status).toBe(403);
      expect(response.data).toMatchObject({
        error: 'insufficient_scope',
        error_description: expect.stringContaining('Required parent scope'),
      });
    });
  });
});
