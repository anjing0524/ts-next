// app/api/v2/roles/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestPermission, TestRole } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { PermissionType, Role } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('role-api');

async function getRoleAdminAccessToken(permissions: string[]): Promise<string> {
  const adminUsername = `roleadmin-${permissions.join('-').replace(':', '')}`;
  // Ensure admin user is unique for each token type to avoid conflicts if tests run in parallel contexts
  const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: adminUsername, email: `${adminUsername}@example.com` });

  const permsToCreate: Partial<TestPermission>[] = [];
  if (permissions.includes('roles:create')) permsToCreate.push({ name: 'roles:create', displayName: 'Create Roles', resource: 'roles', action: 'create'});
  if (permissions.includes('roles:list')) permsToCreate.push({ name: 'roles:list', displayName: 'List Roles', resource: 'roles', action: 'list'});
  // Add other specific role/permission perms if needed by other tests, e.g. permissions:read for validating permissionIds
  if (permissions.includes('permissions:read')) permsToCreate.push({ name: 'permissions:read', displayName: 'Read Permissions', resource: 'permissions', action: 'read'});

  const createdPerms = await Promise.all(permsToCreate.map(p => dataManager.findOrCreatePermission(p)));

  const adminRoleData = {
    name: `test_admin_role_for_role_mgt_${permissions.join('_').replace(':', '')}`,
    permissions: createdPerms.map(p => p.name),
  };
  const adminRole = await dataManager.createRole(adminRoleData);
  await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

  const tokenClient = await dataManager.createClient({ clientId: `token-client-role-mgt-${permissions.join('_').replace(':','')}`, name: 'Token Client Role Mgt', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
  const accessToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, `openid ${permissions.join(' ')}`, permissions);
  return accessToken;
}

describe('Role API Endpoints (/api/v2/roles)', () => {
  let adminCreateToken: string;
  let adminListToken: string;
  let perm1: Permission;
  let perm2: Permission;

  beforeAll(async () => {
    await setup();
    adminCreateToken = await getRoleAdminAccessToken(['roles:create', 'permissions:read']); // Need permissions:read to validate permissionIds
    adminListToken = await getRoleAdminAccessToken(['roles:list']);

    perm1 = await dataManager.findOrCreatePermission({ name: 'test:perm:one', displayName: 'Test Perm One', resource:'test', action: 'one' });
    perm2 = await dataManager.findOrCreatePermission({ name: 'test:perm:two', displayName: 'Test Perm Two', resource:'test', action: 'two' });
  });

  afterAll(async () => {
    await cleanup(); // This should clean up roles and permissions created by dataManager with prefixes
  });

  beforeEach(async () => {
    // Clean up roles created during tests to avoid interference
    await prisma.rolePermission.deleteMany({ where: { role: { name: { startsWith: 'testrole_' } } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: 'testrole_' } } });
  });

  describe('POST /api/v2/roles', () => {
    it('should create a new role without initial permissions successfully (201)', async () => {
      const newRoleData = {
        name: 'testrole_viewer',
        displayName: 'Test Role Viewer',
        description: 'A test role for viewing.',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newRoleData),
      });
      expect(response.status).toBe(201);
      const createdRole = await response.json();
      expect(createdRole.name).toBe(newRoleData.name);
      expect(createdRole.displayName).toBe(newRoleData.displayName);
      expect(createdRole.description).toBe(newRoleData.description);
      expect(createdRole.permissions).toEqual([]); // Expect empty permissions array
    });

    it('should create a new role with initial permissions successfully (201)', async () => {
      const newRoleData = {
        name: 'testrole_editor',
        displayName: 'Test Role Editor',
        description: 'A test role for editing.',
        permissionIds: [perm1.id, perm2.id],
      };
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newRoleData),
      });
      expect(response.status).toBe(201);
      const createdRole = await response.json();
      expect(createdRole.name).toBe(newRoleData.name);
      expect(createdRole.permissions).toHaveLength(2);
      expect(createdRole.permissions.map((p: any) => p.permissionId).sort()).toEqual([perm1.id, perm2.id].sort());
    });

    it('should return 400 for missing name', async () => {
      const newRoleData = { displayName: 'Missing Name Role' };
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newRoleData),
      });
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid permissionIds (e.g., non-existent)', async () => {
      const newRoleData = {
        name: 'testrole_invalid_perms',
        displayName: 'Role With Invalid Perms',
        permissionIds: ['nonexistent_perm_id_123', perm1.id],
      };
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newRoleData),
      });
      expect(response.status).toBe(400); // Expecting failure due to invalid permission ID
      const error = await response.json();
      expect(error.message).toContain("Invalid or non-existent permissionIds provided");
    });

    it('should return 409 for duplicate role name', async () => {
      await dataManager.createRole({ name: 'testrole_duplicate', displayName: 'Duplicate Role Test' });
      const newRoleData = { name: 'testrole_duplicate', displayName: 'Another Duplicate' };
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newRoleData),
      });
      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/v2/roles (List Roles)', () => {
    beforeAll(async () => {
      // Ensure some roles exist for listing
      await dataManager.createRole({ name: 'listrole_alpha', displayName: 'Alpha Role', permissions: [perm1.name] });
      await dataManager.createRole({ name: 'listrole_beta', displayName: 'Beta Role', permissions: [perm2.name] });
    });

    it('should list roles successfully with permissions (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/roles', adminListToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.data)).toBe(true); // Existing API uses result.data
      expect(result.data.length).toBeGreaterThanOrEqual(2);

      const alphaRole = result.data.find((r: Role & { rolePermissions?: any[]}) => r.name === 'listrole_alpha');
      expect(alphaRole).toBeDefined();
      expect(alphaRole.displayName).toBe('Alpha Role');
      expect(alphaRole.rolePermissions).toBeDefined(); // Check if permissions are included
      if (alphaRole.rolePermissions && alphaRole.rolePermissions.length > 0) {
         expect(alphaRole.rolePermissions[0].permissionId).toBe(perm1.id); // Or check nested permission.name
      }

      expect(result.pagination).toBeDefined();
    });

    it('should return 403 for unauthorized access', async () => {
        const regularUser = await dataManager.createTestUser('REGULAR');
        const noPermTokenClient = await dataManager.createClient({ clientId: 'token-client-no-role-list-perm', name: 'Token Client No Role List Perm', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
        const noListToken = await dataManager.createAccessToken(regularUser.id!, noPermTokenClient.clientId, 'openid', []);
        const response = await httpClient.authenticatedRequest('/api/v2/roles', noListToken);
        expect(response.status).toBe(403);
    });
  });
});
