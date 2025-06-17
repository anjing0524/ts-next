// app/api/v2/roles/[roleId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestPermission, TestRole } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { Permission, Role } from '@prisma/client'; // Import Prisma types for Role

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('role-detail-api');

async function getRoleDetailAdminAccessToken(permissionsNeeded: string[]): Promise<string> {
  const adminUsername = `roledetailadmin-${permissionsNeeded.join('-').replace(':', '')}`;
  const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: adminUsername, email: `${adminUsername}@example.com` });

  const permsToCreate: Partial<TestPermission>[] = permissionsNeeded.map(pName => ({
    name: pName,
    displayName: `Role Detail Admin Perm (${pName})`,
    resource: pName.split(':')[0],
    action: pName.split(':')[1] || 'generic'
  }));

  const createdPerms = await Promise.all(permsToCreate.map(p => dataManager.findOrCreatePermission(p)));

  const adminRoleData = {
    name: `test_admin_role_for_role_detail_${permissionsNeeded.join('_').replace(':', '')}`,
    permissions: createdPerms.map(p => p.name),
  };
  const adminRole = await dataManager.createRole(adminRoleData);
  await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

  const tokenClient = await dataManager.createClient({ clientId: `token-client-role-detail-${permissionsNeeded.join('_').replace(':','')}`, name: 'Token Client Role Detail', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
  const accessToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, `openid ${permissionsNeeded.join(' ')}`, permissionsNeeded);
  return accessToken;
}

describe('Role Detail API Endpoints (/api/v2/roles/{roleId})', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminDeleteToken: string;

  let testRoleWithPerms: Role & { permissions: Permission[] };
  let testRoleNoPerms: Role & { permissions: Permission[] };
  let perm1: Permission, perm2: Permission;

  beforeAll(async () => {
    await setup();
    adminReadToken = await getRoleDetailAdminAccessToken(['roles:read']);
    adminUpdateToken = await getRoleDetailAdminAccessToken(['roles:update', 'permissions:read']); // permissions:read to validate new perm IDs
    adminDeleteToken = await getRoleDetailAdminAccessToken(['roles:delete']);

    perm1 = await dataManager.findOrCreatePermission({ name: 'role:detail:perm1', displayName: 'Role Detail Perm One', resource:'role:detail', action: 'perm1' });
    perm2 = await dataManager.findOrCreatePermission({ name: 'role:detail:perm2', displayName: 'Role Detail Perm Two', resource:'role:detail', action: 'perm2' });

    const roleDataWithPerms = await dataManager.createRole({
      name: 'role_with_detail_perms',
      displayName: 'Role With Detail Perms',
      permissions: [perm1.name, perm2.name]
    });
    // Re-fetch to get permissions in the desired structure for test comparison
    const fetchedRoleWithPerms = await prisma.role.findUnique({
        where: {id: roleDataWithPerms.id},
        include: {rolePermissions: {include: {permission: true}}}
    });
    testRoleWithPerms = {
        ...fetchedRoleWithPerms!,
        permissions: fetchedRoleWithPerms!.rolePermissions.map(rp => rp.permission)
    };


    const roleDataNoPerms = await dataManager.createRole({ name: 'role_no_detail_perms', displayName: 'Role No Detail Perms' });
     const fetchedRoleNoPerms = await prisma.role.findUnique({
        where: {id: roleDataNoPerms.id},
        include: {rolePermissions: {include: {permission: true}}}
    });
    testRoleNoPerms = {
        ...fetchedRoleNoPerms!,
        permissions: fetchedRoleNoPerms!.rolePermissions.map(rp => rp.permission)
    };
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v2/roles/{roleId}', () => {
    it('should retrieve an existing role with its permissions successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${testRoleWithPerms.id}`, adminReadToken);
      expect(response.status).toBe(200);
      const role = await response.json();

      expect(role.id).toBe(testRoleWithPerms.id);
      expect(role.name).toBe(testRoleWithPerms.name);
      expect(role.displayName).toBe(testRoleWithPerms.displayName);
      expect(role.permissions).toBeDefined();
      expect(role.permissions.length).toBe(2);
      const returnedPermissionIds = role.permissions.map((p: Permission) => p.id).sort();
      const expectedPermissionIds = [perm1.id, perm2.id].sort();
      expect(returnedPermissionIds).toEqual(expectedPermissionIds);
    });

    it('should retrieve a role with no permissions successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${testRoleNoPerms.id}`, adminReadToken);
      expect(response.status).toBe(200);
      const role = await response.json();
      expect(role.id).toBe(testRoleNoPerms.id);
      expect(role.name).toBe(testRoleNoPerms.name);
      expect(role.permissions).toEqual([]);
    });

    it('should return 404 for a non-existent role ID', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/roles/clnonexistentrole123', adminReadToken);
      expect(response.status).toBe(404);
    });

    it('should return 403 for unauthorized access', async () => {
      const regularUser = await dataManager.createTestUser('REGULAR');
      const noPermTokenClient = await dataManager.createClient({ clientId: 'token-client-no-role-read-perm', name: 'Token Client No Role Read Perm', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
      const noReadToken = await dataManager.createAccessToken(regularUser.id!, noPermTokenClient.clientId, 'openid', []);
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${testRoleWithPerms.id}`, noReadToken);
      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v2/roles/{roleId}', () => {
    let roleToUpdate: Role & { permissions: Permission[] };
    let perm3: Permission;

    beforeAll(async () => {
        perm3 = await dataManager.findOrCreatePermission({ name: 'role:detail:perm3', displayName: 'Role Detail Perm Three', resource:'role:detail', action: 'perm3' });
    });

    beforeEach(async () => {
      const created = await dataManager.createRole({
        name: 'role_to_update',
        displayName: 'Original Update Name',
        description: 'Original Description',
        permissions: [perm1.name], // Initially has perm1
      });
      const fetched = await prisma.role.findUniqueOrThrow({
          where: {id: created.id},
          include: {rolePermissions: {include: {permission: true}}}
      });
      roleToUpdate = {...fetched, permissions: fetched.rolePermissions.map(rp => rp.permission)};
    });

    afterEach(async () => {
      // Clean up the role
      await prisma.rolePermission.deleteMany({ where: { roleId: roleToUpdate.id } });
      await prisma.role.deleteMany({ where: { id: roleToUpdate.id } });
    });

    it('should update role displayName, description, and isActive successfully', async () => {
      const patchData = {
        displayName: 'Updated Role DisplayName',
        description: 'Updated role description.',
        isActive: false,
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToUpdate.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(200);
      const updatedRole = await response.json();
      expect(updatedRole.displayName).toBe(patchData.displayName);
      expect(updatedRole.description).toBe(patchData.description);
      expect(updatedRole.isActive).toBe(false);
      // Permissions should remain unchanged if not specified
      expect(updatedRole.permissions.map((p: Permission) => p.id).sort()).toEqual([perm1.id].sort());
    });

    it('should update role permissions (replace existing with new set)', async () => {
      const patchData = {
        permissionIds: [perm2.id, perm3.id],
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToUpdate.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(200);
      const updatedRole = await response.json();
      expect(updatedRole.permissions).toHaveLength(2);
      const returnedPermissionIds = updatedRole.permissions.map((p: Permission) => p.id).sort();
      const expectedPermissionIds = [perm2.id, perm3.id].sort();
      expect(returnedPermissionIds).toEqual(expectedPermissionIds);
    });

    it('should clear all permissions if permissionIds is an empty array', async () => {
      const patchData = {
        permissionIds: [],
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToUpdate.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(200);
      const updatedRole = await response.json();
      expect(updatedRole.permissions).toHaveLength(0);
    });


    it('should not allow updating role name (400)', async () => {
      const patchData = { name: 'new_role_name_attempt' };
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToUpdate.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('不允许修改角色名称');
    });

    it('should return 400 for invalid (non-existent) permissionIds on update', async () => {
      const patchData = { permissionIds: ['nonexistent_perm_id_123'] };
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToUpdate.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('权限ID无效');
    });

    it('should return 404 for non-existent roleId', async () => {
        const patchData = { displayName: "No such role" };
        const response = await httpClient.authenticatedRequest('/api/v2/roles/clnonexistentrole123', adminUpdateToken, {
            method: 'PATCH',
            body: JSON.stringify(patchData)
        });
        expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v2/roles/{roleId}', () => {
    let roleToDelete: Role;
     let userAssignedToRole: any;


    beforeEach(async () => {
      // Create a fresh role for each delete test
      const created = await dataManager.createRole({ name: 'role_to_be_deleted', displayName: 'Role To Delete' });
      // Fetch to ensure we have the ID correctly (dataManager.createRole might need to return the full object or just ID)
      roleToDelete = await prisma.role.findUniqueOrThrow({where: {name: 'role_to_be_deleted'}});
    });

    afterEach(async () => {
        if (userAssignedToRole) {
            await prisma.userRole.deleteMany({where: {userId: userAssignedToRole.id}});
            await prisma.user.delete({where: {id: userAssignedToRole.id}});
            userAssignedToRole = null;
        }
        await prisma.rolePermission.deleteMany({ where: { roleId: roleToDelete?.id } });
        await prisma.role.deleteMany({ where: { id: roleToDelete?.id } });
    });


    it('should delete a role successfully (204)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToDelete.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(204);
      const dbRole = await prisma.role.findUnique({ where: { id: roleToDelete.id } });
      expect(dbRole).toBeNull();
    });

    it('should return 409 if role is assigned to users', async () => {
      userAssignedToRole = await dataManager.createUser({username: 'user_with_role_to_delete', password: 'Password123!'});
      await dataManager.assignRoleToUser(userAssignedToRole.id!, roleToDelete.id);

      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${roleToDelete.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(409);
      const errorBody = await response.json();
      expect(errorBody.message).toContain('still in use by');
    });

    it('should not delete core system roles (e.g., SYSTEM_ADMIN) (403)', async () => {
      const systemAdminRole = await prisma.role.findUnique({where: {name: 'SYSTEM_ADMIN'}});
      if (!systemAdminRole) {
        // If SYSTEM_ADMIN doesn't exist (e.g. tests cleaned it), this test might not be meaningful
        // or we might need to create it via a seed or helper for this test.
        // For now, assume it exists from initial seeding or previous tests.
        console.warn("SYSTEM_ADMIN role not found, skipping core role deletion test.");
        return;
      }
      const response = await httpClient.authenticatedRequest(`/api/v2/roles/${systemAdminRole.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(403);
       const errorBody = await response.json();
      expect(errorBody.message).toContain('Core system role');
    });
     it('should return 404 for non-existent roleId', async () => {
        const response = await httpClient.authenticatedRequest('/api/v2/roles/clnonexistentrole123', adminDeleteToken, {
            method: 'DELETE'
        });
        expect(response.status).toBe(404);
    });
  });
});
