// app/api/v2/permissions/[permissionId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestPermission } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { PermissionType, HttpMethod, Role, Permission } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('permission-detail-api');

async function getPermissionDetailAdminAccessToken(permissions: string[]): Promise<string> {
  const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: `permadmin-${permissions.join('-').replace(':', '')}` });

  const permsToCreate: Partial<TestPermission>[] = [];
  if (permissions.includes('permissions:read')) permsToCreate.push({ name: 'permissions:read', displayName: 'Read Permissions', resource: 'permissions', action: 'read'});
  if (permissions.includes('permissions:update')) permsToCreate.push({ name: 'permissions:update', displayName: 'Update Permissions', resource: 'permissions', action: 'update'});
  if (permissions.includes('permissions:delete')) permsToCreate.push({ name: 'permissions:delete', displayName: 'Delete Permissions', resource: 'permissions', action: 'delete'});

  const createdPerms = await Promise.all(permsToCreate.map(p => dataManager.findOrCreatePermission(p)));

  const adminRoleData = {
    name: `test_admin_role_for_perm_detail_${permissions.join('_').replace(':', '')}`,
    permissions: createdPerms.map(p => p.name),
  };
  const adminRole = await dataManager.createRole(adminRoleData);
  await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

  const tokenClient = await dataManager.createClient({ clientId: `token-client-perm-detail-${permissions.join('_').replace(':','')}`, name: 'Token Client Perm Detail', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
  const accessToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, `openid ${permissions.join(' ')}`, permissions);
  return accessToken;
}

describe('Permission Detail API Endpoints (/api/v2/permissions/{permissionId})', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminDeleteToken: string;
  let testPermissionAPI: Permission;
  let testPermissionMENU: Permission;

  beforeAll(async () => {
    await setup();
    adminReadToken = await getPermissionDetailAdminAccessToken(['permissions:read']);
    adminUpdateToken = await getPermissionDetailAdminAccessToken(['permissions:update']);
    adminDeleteToken = await getPermissionDetailAdminAccessToken(['permissions:delete', 'permissions:create']); // Create needed for role assignment test

    // Create some permissions for testing
    testPermissionAPI = await dataManager.findOrCreatePermission({
      name: 'test:api:get',
      displayName: 'Get Test API',
      resource: 'test:api',
      action: 'get',
      type: PermissionType.API,
      apiDetails: { httpMethod: HttpMethod.GET, endpoint: '/api/v2/testget' }
    });

    // Need a menu item to link for menu permission
    const menu = await prisma.menu.create({ data: { name: 'Test Menu Item', key: 'test_menu_item_perms' }});
    testPermissionMENU = await dataManager.findOrCreatePermission({
      name: 'test:menu:view',
      displayName: 'View Test Menu',
      resource: 'test:menu',
      action: 'view',
      type: PermissionType.MENU,
      menuDetails: { menuId: menu.id }
    });
  });

  afterAll(async () => {
    await prisma.menu.deleteMany({where: {key: 'test_menu_item_perms'}}); // Clean up menu
    await cleanup(); // Cleans up permissions created by dataManager with prefixes
  });

  // Clean up permissions that might be created without a prefix by tests directly
   afterEach(async () => {
    try { await prisma.permission.deleteMany({ where: { name: 'test:api:updated' } }); } catch(e) {}
  });


  describe('GET /api/v2/permissions/{permissionId}', () => {
    it('should retrieve an existing API permission successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionAPI.id}`, adminReadToken);
      expect(response.status).toBe(200);
      const permission = await response.json();
      expect(permission.id).toBe(testPermissionAPI.id);
      expect(permission.name).toBe(testPermissionAPI.name);
      expect(permission.type).toBe(PermissionType.API);
      expect(permission.apiPermission).toBeDefined();
      expect(permission.apiPermission.httpMethod).toBe(HttpMethod.GET);
    });

    it('should retrieve an existing MENU permission successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionMENU.id}`, adminReadToken);
      expect(response.status).toBe(200);
      const permission = await response.json();
      expect(permission.id).toBe(testPermissionMENU.id);
      expect(permission.type).toBe(PermissionType.MENU);
      expect(permission.menuPermission).toBeDefined();
      expect(permission.menuPermission.menu).toBeDefined(); // Check for nested menu
      expect(permission.menuPermission.menu.key).toBe('test_menu_item_perms');
    });

    it('should return 404 for a non-existent permission ID', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/clnonexistent123`, adminReadToken);
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v2/permissions/{permissionId} (effectively PATCH)', () => {
    it('should update displayName and description successfully (200)', async () => {
      const updatePayload = {
        displayName: 'Updated Get Test API DisplayName',
        description: 'This is an updated description.',
        isActive: false,
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionAPI.id}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedPermission = await response.json();
      expect(updatedPermission.displayName).toBe(updatePayload.displayName);
      expect(updatedPermission.description).toBe(updatePayload.description);
      expect(updatedPermission.isActive).toBe(false);

      const dbPermission = await prisma.permission.findUnique({ where: { id: testPermissionAPI.id } });
      expect(dbPermission?.displayName).toBe(updatePayload.displayName);
      expect(dbPermission?.isActive).toBe(false);
    });

    it('should update API-specific details successfully (200)', async () => {
      const updatePayload = {
        apiDetails: {
          httpMethod: HttpMethod.POST,
          endpoint: '/api/v2/testupdated',
        },
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionAPI.id}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedPermission = await response.json();
      expect(updatedPermission.apiPermission.httpMethod).toBe(HttpMethod.POST);
      expect(updatedPermission.apiPermission.endpoint).toBe('/api/v2/testupdated');
    });

    it('should return 400 when trying to update immutable fields like name or type', async () => {
      const updatePayloadName = { name: 'test:api:newName' };
      let response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionAPI.id}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayloadName),
      });
      expect(response.status).toBe(400); // As per existing route logic

      const updatePayloadType = { type: PermissionType.MENU };
      response = await httpClient.authenticatedRequest(`/api/v2/permissions/${testPermissionAPI.id}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayloadType),
      });
      expect(response.status).toBe(400); // As per existing route logic
    });

    it('should return 404 when trying to update a non-existent permission', async () => {
      const updatePayload = { displayName: "No Such Permission" };
      const response = await httpClient.authenticatedRequest('/api/v2/permissions/nonexistentpermissionid', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v2/permissions/{permissionId}', () => {
    let permToDelete: Permission;

    beforeEach(async () => {
      // Create a fresh permission for each delete test
      permToDelete = await dataManager.findOrCreatePermission({
        name: 'test:permission:todelete',
        displayName: 'Permission To Delete',
        resource: 'test:permission',
        action: 'todelete',
        type: PermissionType.API,
        apiDetails: { httpMethod: HttpMethod.DELETE, endpoint: '/api/v2/testdelete'}
      });
    });

    it('should delete an existing permission successfully (204)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${permToDelete.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(204);
      const dbPermission = await prisma.permission.findUnique({ where: { id: permToDelete.id } });
      expect(dbPermission).toBeNull();
    });

    it('should return 404 when trying to delete a non-existent permission', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/permissions/nonexistentpermissionidfordelete', adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(404);
    });

    it('should return 409 if permission is still assigned to a role', async () => {
      const role = await dataManager.createRole({ name: 'role_using_permission', permissions: [permToDelete.name] });

      const response = await httpClient.authenticatedRequest(`/api/v2/permissions/${permToDelete.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.message).toContain('still in use by');

      // Cleanup: remove permission from role, then delete role, then permission can be deleted by afterEach or globally
      await prisma.rolePermission.deleteMany({where: {roleId: role.id, permissionId: permToDelete.id}});
      await prisma.role.delete({where: {id: role.id}});
    });
  });
});
