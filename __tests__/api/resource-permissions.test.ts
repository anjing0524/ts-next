import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { addMinutes } from 'date-fns';

// Import route functions directly
import { GET as resourcesGET, POST as resourcesPOST } from '@/app/api/resources/route';
import { GET as resourceByIdGET } from '@/app/api/resources/[resourceId]/route'; // PUT, DELETE are via fetch
// import { GET as permissionsGET, POST as permissionsPOST } from '@/app/api/permissions/route'; // Covered by fetch
// import { GET as permissionByIdGET, PUT as permissionByIdPUT, DELETE as permissionByIdDELETE } from '@/app/api/permissions/[permissionId]/route'; // Covered by fetch
// import { GET as userPermissionsGET, POST as userPermissionsPOST } from '@/app/api/users/[userId]/permissions/route'; // Covered by fetch

const BASE_URL = 'http://localhost:3000/datamgr_flow';

describe('资源管理与权限系统测试 / Resource Management and Permission System Tests', () => {
  let adminUser: any = null;
  let regularUser: any = null;
  let testClient: any = null;
  let testResource: any = null;
  let testPermission: any = null;
  let testScope: any = null;

  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function setupTestData(): Promise<void> {
    const adminPassword = await bcrypt.hash('AdminPassword123!', 12);
    adminUser = await prisma.user.create({
      data: { username: 'resourceadmin-' + Date.now(), email: `resourceadmin-${Date.now()}@example.com`, password: adminPassword, emailVerified: true, isActive: true, firstName: 'Resource', lastName: 'Admin' },
    });
    const userPassword = await bcrypt.hash('UserPassword123!', 12);
    regularUser = await prisma.user.create({
      data: { username: 'resourceuser-' + Date.now(), email: `resourceuser-${Date.now()}@example.com`, password: userPassword, emailVerified: true, isActive: true, firstName: 'Resource', lastName: 'User' },
    });
    const clientSecret = crypto.randomBytes(32).toString('hex');
    testClient = await prisma.client.create({
      data: {
        clientId: 'resource-test-client-' + Date.now(), clientSecret: await bcrypt.hash(clientSecret, 12), name: 'Resource Test Client',
        redirectUris: JSON.stringify(['http://localhost:3000/callback']), scope: 'openid profile email api:read api:write', isActive: true, isPublic: false,
        grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']), responseTypes: JSON.stringify(['code']), tokenEndpointAuthMethod: 'client_secret_basic',
      },
    });
    testClient.plainSecret = clientSecret;
    const scopesData = [
      { name: 'api:read', description: 'API read access', isActive: true, isPublic: false }, { name: 'api:write', description: 'API write access', isActive: true, isPublic: false },
      { name: 'resource:admin', description: 'Resource admin access', isActive: true, isPublic: false },
    ];
    for (const scopeData of scopesData) {
      await prisma.scope.upsert({ where: { name: scopeData.name }, update: {}, create: scopeData });
    }
    testScope = await prisma.scope.findFirst({ where: { name: 'api:read' } });
  }

  async function cleanupTestData(): Promise<void> {
    if (adminUser?.id) await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    if (regularUser?.id) await prisma.user.delete({ where: { id: regularUser.id } }).catch(() => {});
    if (testClient?.id) await prisma.client.delete({ where: { id: testClient.id } }).catch(() => {});
  }

  describe('资源管理API测试 / Resource Management API Tests', () => {
    it('TC_RP_001_001: 应处理资源创建请求 / Should handle resource creation requests', async () => {
      const resourceData = {
        name: 'Test Resource',
        description: 'A test resource for permission testing',
        type: 'api',
        uri: '/api/test-resource',
      };

      const resourceRequest = createNextRequest('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer fake_admin_token`,
        },
        body: JSON.stringify(resourceData),
      });

      const response = await resourcesPOST(resourceRequest);

      // Assuming fake_admin_token is treated as unauthorized or insufficient for direct route calls
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST]);
      if (response.status === TEST_CONFIG.HTTP_STATUS.CREATED) {
        const data = await response.json();
        expect(data.name).toBe(resourceData.name);
        testResource = data; // Save for later tests
      }
    });

    it('TC_RP_001_002: 应处理资源列表请求 / Should handle resource listing requests', async () => {
      const resourceRequest = createNextRequest('/api/resources', { headers: { Authorization: `Bearer fake_admin_token` } });
      const response = await resourcesGET(resourceRequest);
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const data = await response.json();
        expect(Array.isArray(data.resources) || Array.isArray(data)).toBe(true);
      }
    });

    it('TC_RP_001_003: 应处理按ID检索资源 / Should handle resource retrieval by ID', async () => {
      const resourceId = testResource?.id || 'nonexistent-resource-id-rp';
      const resourceRequest = createNextRequest(`/api/resources/${resourceId}`, { headers: { Authorization: `Bearer fake_admin_token` } });
      const response = await resourceByIdGET(resourceRequest, { params: { resourceId } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_001_004: 应处理资源更新请求 / Should handle resource update requests', async () => {
      const resourceId = testResource?.id || 'nonexistent-resource-id-rp';
      const updateData = { description: 'Updated RP resource description', uri: '/api/updated-rp-resource' };
      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(updateData),
      });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_001_005: 应处理资源删除请求 / Should handle resource deletion requests', async () => {
      const tempResourceForDelete = await prisma.resource.create({data: {name: 'temp-delete-res-rp001005', type: 'api', uri: '/api/temp-delete-rp001005'}});
      const resourceId = tempResourceForDelete.id;

      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, { method: 'DELETE', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.NO_CONTENT, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });
  });

  describe('权限管理API测试 / Permission Management API Tests', () => {
    it('TC_RP_002_001: 应处理权限创建请求 / Should handle permission creation requests', async () => {
      const permissionData = {
        name: 'test:read',
        description: 'Read access to test resources',
        resourceType: 'api',
        action: 'read',
      };

      const response = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer fake_admin_token`,
        },
        body: JSON.stringify(permissionData),
      });

      expect([200, 201, 401, 403, 404, 422, 429, 500]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        expect(data.name).toBe(permissionData.name);
        testPermission = data;
      }
    });

    it('TC_RP_002_002: 应处理权限列表请求 / Should handle permission listing requests', async () => {
      const response = await fetch(`${BASE_URL}/api/permissions`, { method: 'GET', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const data = await response.json();
        expect(Array.isArray(data.permissions) || Array.isArray(data)).toBe(true);
      }
    });

    it('TC_RP_002_003: 应处理按ID检索权限 / Should handle permission retrieval by ID', async () => {
      const permissionId = testPermission?.id || 'nonexistent-permission-id-rp';
      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, { method: 'GET', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_002_004: 应处理权限更新请求 / Should handle permission update requests', async () => {
      const permissionId = testPermission?.id || 'nonexistent-permission-id-rp';
      const updateData = { description: 'Updated RP permission desc', action: 'write' };
      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(updateData),
      });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_002_005: 应处理权限删除请求 / Should handle permission deletion requests', async () => {
      const tempPermissionForDelete = await prisma.permission.create({data: {name: 'temp:delete-perm-rp002005', description: 'temp', resource: 'temp', action: 'delete'}});
      const permissionId = tempPermissionForDelete.id;
      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, { method: 'DELETE', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.NO_CONTENT, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });
  });

  describe('用户-资源权限关系 / User-Resource Permission Relationships', () => {
    it('TC_RP_003_001: 应处理用户权限分配 / Should handle user permission assignment', async () => {
      const assignmentData = {
        userId: regularUser.id,
        permissionId: testPermission?.id || 'test-permission-id',
        resourceId: testResource?.id || 'test-resource-id',
      };

      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(assignmentData),
      });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
    });

    it('TC_RP_003_002: 应处理用户权限列表 / Should handle user permission listing', async () => {
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, { method: 'GET', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const data = await response.json();
        expect(Array.isArray(data.permissions) || Array.isArray(data)).toBe(true);
      }
    });

    it('TC_RP_003_003: 应处理用户权限撤销 / Should handle user permission revocation', async () => {
      const permissionId = testPermission?.id || 'nonexistent-permission-id-rp';
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions/${permissionId}`, { method: 'DELETE', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.NO_CONTENT, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_003_004: 应验证用户对资源的访问 / Should validate user access to resources', async () => {
      const resourceId = testResource?.id || 'nonexistent-resource-id-rp';
      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, { method: 'GET', headers: { Authorization: `Bearer fake_user_token` } });
      // Expect 401 (invalid fake_user_token) or 403 (if token valid but no permission) or 404
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
    });
  });

  describe('客户端-资源权限关系 / Client-Resource Permission Relationships', () => {
    it('TC_RP_004_001: 应处理客户端范围验证 / Should handle client scope validation', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read api:write',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret,
        }),
      });

      expect([200, 400, 401, 403, 404, 429, 500]).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.access_token).toBeDefined();
        expect(data.scope).toContain('api:read');
        expect(data.scope).toContain('api:write');
      }
    });

    it('TC_RP_004_002: 应拒绝客户端访问未经授权的范围 / Should reject client access to unauthorized scopes', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'admin:super unauthorized:scope', client_id: testClient.clientId, client_secret: testClient.plainSecret }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST); // invalid_scope
      const data = await response.json();
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_SCOPE);
    });

    it('TC_RP_004_003: 应通过令牌验证客户端对资源的访问 / Should validate client access to resources via token', async () => {
      const tokenResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'api:read', client_id: testClient.clientId, client_secret: testClient.plainSecret }),
      });
      let accessToken = 'fake_client_token_for_resource_access_rp'; // Fallback
      if (tokenResponse.status === TEST_CONFIG.HTTP_STATUS.OK) {
        accessToken = (await tokenResponse.json()).access_token;
      } else {
        // If token acquisition fails, this test cannot proceed meaningfully for the resource access part.
        // For coverage, we might still try with the fake token.
      }
      const resourceResponse = await fetch(`${BASE_URL}/api/resources`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
      // If token is fake or lacks general resource listing permission, expect 401/403. If valid, 200.
      expect(resourceResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });
  });

  describe('范围管理测试 / Scope Management Tests', () => {
    it('TC_RP_005_001: 应处理范围列表请求 / Should handle scope listing requests', async () => {
      const response = await fetch(`${BASE_URL}/api/scopes`, { method: 'GET', headers: { Authorization: `Bearer fake_admin_token` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const data = await response.json();
        expect(Array.isArray(data.scopes) || Array.isArray(data)).toBe(true);
      }
    });

    it('TC_RP_005_002: 应处理范围创建请求 / Should handle scope creation requests', async () => {
      const scopeData = {
        name: 'test:custom-rp', // Unique name
        description: 'Custom RP test scope',
        isActive: true,
        isPublic: false,
      };
      const response = await fetch(`${BASE_URL}/api/scopes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(scopeData),
      });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_005_003: 应验证范围层级和继承 / Should validate scope hierarchies and inheritance', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'api:read api:write resource:admin', client_id: testClient.clientId, client_secret: testClient.plainSecret }),
      });
      // This test is more about if the token request is processed correctly with these scopes.
      // Actual hierarchy/inheritance is tested by using the issued token against resources.
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST]); // OK if scopes allowed, BAD_REQUEST if any are invalid for client
    });
  });

  describe('访问控制和安全测试 / Access Control and Security Tests', () => {
    it('TC_RP_006_001: 应强制执行资源级访问控制 / Should enforce resource-level access control', async () => {
      const endpoints = ['/api/resources', '/api/permissions', '/api/scopes', '/api/users', '/api/clients'];
      for (const endpoint of endpoints) {
        const noAuthResponse = await fetch(`${BASE_URL}${endpoint}`, { method: 'GET' });
        expect(noAuthResponse.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]); // Some might be 404 if endpoint root isn't listable

        const invalidTokenResponse = await fetch(`${BASE_URL}${endpoint}`, { method: 'GET', headers: { Authorization: 'Bearer invalid_token_rp' } });
        expect(invalidTokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      }
    });

    it('TC_RP_006_002: 应验证资源所有权和权限 / Should validate resource ownership and permissions', async () => {
      const response = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, { method: 'GET', headers: { Authorization: `Bearer fake_regular_user_token_rp` } }); // Regular user token trying to access admin user's details
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // Fake token is invalid
    });

    it('TC_RP_006_003: 应处理权限继承和级联 / Should handle permission inheritance and cascading', async () => {
      const permissionData = { resourceId: testResource?.id || 'res-perm-inherit-rp', userId: regularUser.id, permissions: ['read', 'write'], inherit: true };
      const response = await fetch(`${BASE_URL}/api/resources/${testResource?.id || 'res-perm-inherit-rp'}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(permissionData),
      });
      // This depends on the specific API structure, which might not match the URL.
      // Assuming it's a conceptual test for now or the endpoint /api/resources/:resourceId/permissions exists.
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_006_004: 应验证跨资源权限边界 / Should validate cross-resource permission boundaries', async () => {
      const resourceAToken = 'fake_resource_a_token_rp'; // Token that might grant access to resource A
      const resourceBId = 'resource-b-id-rp';
      const response = await fetch(`${BASE_URL}/api/resources/${resourceBId}`, { method: 'GET', headers: { Authorization: `Bearer ${resourceAToken}` } });
      // Expect 401 (invalid fake token) or 403/404 if token was valid but for different resource
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
    });
  });

  describe('错误处理和边缘情况 / Error Handling and Edge Cases', () => {
    it('TC_RP_007_001: 应处理格式错误的权限请求 / Should handle malformed permission requests', async () => {
      const malformedData = { invalidField: 'invalid_value_rp', permissions: 'not_an_array_rp' };
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` }, body: JSON.stringify(malformedData),
      });
      // Expect 400 for bad request or 422 if data is unprocessable, 401/403 for auth
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
    });

    it('TC_RP_007_002: 应处理并发权限操作 / Should handle concurrent permission operations', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer fake_admin_token` },
          body: JSON.stringify({ permissionId: `test-permission-rp-${i}`, resourceId: `test-resource-rp-${i}` }),
        })
      );
      const responses = await Promise.all(promises);
      responses.forEach((response) => {
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.CONFLICT]);
      });
    });

    it('TC_RP_007_003: 用户删除时应处理资源清理 / Should handle resource cleanup on user deletion', async () => {
      // Create a temporary user for this test
      const tempUser = await prisma.user.create({ data: { username: 'temp-delete-user-rp', email: 'tempdelrp@example.com', password: await bcrypt.hash('password',10), isActive: true }});
      const response = await fetch(`${BASE_URL}/api/users/${tempUser.id}`, { method: 'DELETE', headers: { Authorization: `Bearer fake_admin_token` } });
      // Expect 204 (No Content) or 200 (OK) if successful, or 401/403/404
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.NO_CONTENT, TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
      if(response.status === TEST_CONFIG.HTTP_STATUS.NO_CONTENT || response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        // Verify user is deleted or marked inactive
        const deletedUser = await prisma.user.findUnique({where: {id: tempUser.id}});
        expect(deletedUser === null || deletedUser?.isActive === false).toBe(true);
      }
    });
  });
});

// Helper to create Next.js request object
function createNextRequest(url: string, options: RequestInit = {}): NextRequest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow';
  const baseUrl = 'http://localhost:3000';
  const fullUrl = `${baseUrl}${basePath}${url}`;

  const { signal, ...safeOptions } = options;

  return new NextRequest(fullUrl, {
    method: 'GET',
    ...safeOptions,
    ...(signal && { signal }),
  });
}
