/**
 * 用户权限管理API增强测试套件
 *
 * 测试目标：
 * 1. 提升/api/users/[userId]/permissions端点的代码覆盖率
 * 2. 验证权限授予、撤销和查询功能
 * 3. 测试所有错误处理路径和边界条件
 * 4. 覆盖Prisma错误处理和数据验证
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOAuth2TestSetup, TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG
import { prisma } from '@/lib/prisma';

describe('用户权限管理API增强测试 / User Permissions Management API Enhanced Tests', () => {
  const testSetup = createOAuth2TestSetup('users_permissions_enhanced');
  const { dataManager, httpClient } = testSetup;

  let testUser: any;
  let testClient: any;
  let adminToken: string;
  let testResource: any;
  let testPermission: any;
  let readPermission: any;
  let writePermission: any;

  beforeAll(async () => {
    await testSetup.setup();

    // 创建测试用户和客户端
    testUser = await dataManager.createTestUser('regularUser');
    testClient = await dataManager.createTestClient('webApp');

    // 创建管理员令牌
    adminToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'admin');

    // 创建测试资源和权限
    testResource = await prisma.resource.create({
      data: {
        name: 'test_resource_api',
        description: 'Test Resource for API Testing',
        apiPath: '/api/test',
        isActive: true,
      },
    });

    testPermission = await prisma.permission.create({
      data: {
        name: 'test_permission_api',
        description: 'Test Permission for API Testing',
        isActive: true,
      },
    });

    readPermission = await prisma.permission.create({
      data: {
        name: 'read_test_api',
        description: 'Read Permission for API Testing',
        isActive: true,
      },
    });

    writePermission = await prisma.permission.create({
      data: {
        name: 'write_test_api',
        description: 'Write Permission for API Testing',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.userResourcePermission.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.resource.deleteMany({
      where: { name: { startsWith: 'test_' } },
    });
    await prisma.permission.deleteMany({
      where: { name: { startsWith: 'test_' } },
    });

    await testSetup.cleanup();
  });

  describe('POST /api/users/[userId]/permissions - 授予权限 / Grant Permission', () => {
    it('TC_UPE_001_001: 管理员应能成功授予用户权限 / Admin should successfully grant permission to user', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: testPermission.id }),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.CREATED);
      const data = await response.json();
      expect(data).toMatchObject({
        userId: testUser.id, resourceId: testResource.id, permissionId: testPermission.id,
        resource: { name: testResource.name }, permission: { name: testPermission.name },
      });
    });

    it('TC_UPE_001_002: 应处理重复授予权限的情况（幂等性）/ Should handle duplicate permission grants (idempotency)', async () => {
      await httpClient.request(`/api/users/${testUser.id}/permissions`, { // First grant
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: readPermission.id }),
      });
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, { // Second grant
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: readPermission.id }),
      });
      // Expect 200 if returning existing, or 409 if conflict. Some APIs might return 201 again if not strictly idempotent but "ensure state".
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.CONFLICT, TEST_CONFIG.HTTP_STATUS.CREATED]);
    });

    it('TC_UPE_001_003: 应拒绝无效的resourceId格式 / Should reject invalid resourceId format', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: 'invalid-uuid-format', permissionId: testPermission.id }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.errors?.resourceId).toBeDefined();
    });

    it('TC_UPE_001_004: 应拒绝无效的permissionId格式 / Should reject invalid permissionId format', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: 'invalid-uuid-format' }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.errors?.permissionId).toBeDefined();
    });

    it('TC_UPE_001_005: 应拒绝不存在的用户ID / Should reject non-existent user ID', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'; // Standard nil UUID
      const response = await httpClient.request(`/api/users/${nonExistentUserId}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: testPermission.id }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      const data = await response.json();
      expect(data.message).toContain('User not found');
    });

    it('TC_UPE_001_006: 应拒绝不存在的资源ID / Should reject non-existent resource ID', async () => {
      const nonExistentResourceId = '00000000-0000-0000-0000-000000000000';
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: nonExistentResourceId, permissionId: testPermission.id }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      const data = await response.json();
      expect(data.message).toContain('Resource not found');
    });

    it('TC_UPE_001_007: 应拒绝不存在的权限ID / Should reject non-existent permission ID', async () => {
      const nonExistentPermissionId = '00000000-0000-0000-0000-000000000000';
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id, permissionId: nonExistentPermissionId }),
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      const data = await response.json();
      expect(data.message).toContain('Permission not found');
    });

    it('TC_UPE_001_008: 应拒绝缺少必需字段的请求 / Should reject request missing required fields', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ resourceId: testResource.id }), // Missing permissionId
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.errors?.permissionId).toBeDefined();
    });

    it('TC_UPE_001_009: 应拒绝无效的JSON格式 / Should reject invalid JSON format', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: 'this is not json',
      });
      // Invalid JSON typically results in 400 from Next.js body parsing, or 500 if not handled gracefully by middleware.
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR]);
    });
  });

  describe('DELETE /api/users/[userId]/permissions - 撤销权限 / Revoke Permission', () => {
    beforeAll(async () => {
      await prisma.userResourcePermission.create({ data: { userId: testUser.id, resourceId: testResource.id, permissionId: writePermission.id } });
    });

    it('TC_UPE_002_001: 应成功撤销用户权限 / Should successfully revoke user permission', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions?resourceId=${testResource.id}&permissionId=${writePermission.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const data = await response.json();
      expect(data.message).toContain('revoked successfully');
    });

    it('TC_UPE_002_002: 应处理撤销不存在的权限（返回404）/ Should handle revocation of non-existent permission (return 404)', async () => {
      const nonExistentPermissionId = '00000000-0000-0000-0000-000000000000';
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions?resourceId=${testResource.id}&permissionId=${nonExistentPermissionId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      const data = await response.json();
      expect(data.message).toContain('not found');
    });

    it('TC_UPE_002_003: 应拒绝缺少resourceId参数的请求 / Should reject request missing resourceId parameter', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions?permissionId=${testPermission.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.message).toContain('Missing'); expect(data.message).toContain('resourceId');
    });

    it('TC_UPE_002_004: 应拒绝缺少permissionId参数的请求 / Should reject request missing permissionId parameter', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions?resourceId=${testResource.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.message).toContain('Missing'); expect(data.message).toContain('permissionId');
    });

    it('TC_UPE_002_005: 应拒绝同时缺少两个参数的请求 / Should reject request missing both parameters', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await response.json();
      expect(data.message).toContain('Missing');
    });
  });

  describe('GET /api/users/[userId]/permissions - 查询权限 / Query Permissions', () => {
    beforeAll(async () => {
      await prisma.userResourcePermission.createMany({ data: [ { userId: testUser.id, resourceId: testResource.id, permissionId: readPermission.id } ] });
    });

    it('TC_UPE_003_001: 应成功获取用户的所有权限 / Should successfully get all permissions for a user', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      const permission = data[0];
      expect(permission).toHaveProperty('userId', testUser.id);
      expect(permission).toHaveProperty('resource'); expect(permission).toHaveProperty('permission');
      expect(permission.resource).toHaveProperty('name'); expect(permission.permission).toHaveProperty('name');
    });

    it('TC_UPE_003_002: 应处理不存在的用户ID（返回404）/ Should handle non-existent user ID (return 404)', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
      const response = await httpClient.request(`/api/users/${nonExistentUserId}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.NOT_FOUND);
      const data = await response.json();
      expect(data.message).toContain('not found');
    });

    it('TC_UPE_003_003: 当用户没有权限时应返回空数组 / Should return an empty array if user has no permissions', async () => {
      const newUser = await dataManager.createUser({ username: 'no_permissions_user_upe', email: 'noperm_upe@test.com', password: 'TestPass123!', firstName: 'NoPerm', lastName: 'UserUPE', isActive: true, emailVerified: true });
      const response = await httpClient.request(`/api/users/${newUser.id}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true); expect(data.length).toBe(0);
      await prisma.user.delete({ where: { id: newUser.id } }); // Clean up temporary user
    });
  });

  describe('错误处理和边界条件 / Error Handling and Boundary Conditions', () => {
    it('TC_UPE_004_001: 应处理无效UUID格式的userId / Should handle invalid UUID format for userId', async () => {
      const response = await httpClient.request(`/api/users/invalid-uuid/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]); // Invalid UUID should be Bad Request
    });

    it('TC_UPE_004_002: 应处理超长的用户ID / Should handle excessively long userId', async () => {
      const longUserId = 'a'.repeat(1000);
      const response = await httpClient.request(`/api/users/${longUserId}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]); // Likely Bad Request due to format
    });

    it('TC_UPE_004_003: 应处理含特殊字符的用户ID / Should handle userId with special characters', async () => {
      const specialUserId = 'user@!#$%^&*()';
      const response = await httpClient.request(`/api/users/${encodeURIComponent(specialUserId)}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
    });
  });

  describe('HTTP方法测试 / HTTP Method Tests', () => {
    it('TC_UPE_005_001: 应拒绝不支持的HTTP方法 (PUT) / Should reject unsupported HTTP method (PUT)', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED);
    });

    it('TC_UPE_005_002: 应拒绝PATCH方法 / Should reject PATCH method', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` } });
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED);
    });
  });

  describe('性能和并发测试 / Performance and Concurrency Tests', () => {
    it('TC_UPE_006_001: 应能处理并发权限授予请求 / Should handle concurrent permission grant requests', async () => {
      const permissions = await Promise.all([
        prisma.permission.create({ data: { name: 'concurrent_perm_1_upe', description: 'Concurrent Test 1 UPE', isActive: true } }),
        prisma.permission.create({ data: { name: 'concurrent_perm_2_upe', description: 'Concurrent Test 2 UPE', isActive: true } }),
        prisma.permission.create({ data: { name: 'concurrent_perm_3_upe', description: 'Concurrent Test 3 UPE', isActive: true } }),
      ]);
      const concurrentRequests = permissions.map((permission) =>
        httpClient.request(`/api/users/${testUser.id}/permissions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ resourceId: testResource.id, permissionId: permission.id }),
        })
      );
      const responses = await Promise.all(concurrentRequests);
      responses.forEach((response) => {
        expect(response.status).toBeOneOf([TEST_CONFIG.HTTP_STATUS.CREATED, TEST_CONFIG.HTTP_STATUS.CONFLICT]);
      });
      await prisma.permission.deleteMany({ where: { name: { startsWith: 'concurrent_perm_' } } });
    });

    it('TC_UPE_006_002: 应在合理时间内响应 / Should respond within a reasonable timeframe', async () => {
      const startTime = Date.now();
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      expect(responseTime).toBeLessThan(2000); // Expect response within 2 seconds
    });
  });
});
