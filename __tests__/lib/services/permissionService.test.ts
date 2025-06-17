// __tests__/lib/services/permissionService.test.ts

import { prisma } from '@/lib/prisma';
import { PermissionService } from '@/lib/services/permissionService';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../utils/test-helpers';
import { Role, User, Permission, OAuthClient } from '@prisma/client'; // Import Prisma types

describe('PermissionService', () => {
  let service: PermissionService;
  let testDataCreator: TestDataManager;
  let user1: User, user2: User, adminUser: User;
  let roleAdmin: Role, roleEditor: Role, roleViewer: Role;
  let permUserList: Permission, permUserCreate: Permission, permArticleRead: Permission, permArticleEdit: Permission;
  let clientApp: OAuthClient; // In case some permissions might be client-related in future

  beforeAll(async () => {
    await setupTestDb(); // Clear DB and set up basic scopes, etc.
    service = new PermissionService(); // Instantiate the service
  });

  beforeEach(async () => {
    // Create a new TestDataManager for each test to ensure data isolation via prefixes
    testDataCreator = new TestDataManager('perm_service_');
    await service.clearUserPermissionCache(''); // Clear cache for all users, just in case

    // Seed Data
    // 1. Permissions
    permUserList = await prisma.permission.create({
      data: { name: 'users:list', displayName: 'List Users', resource: 'user', action: 'list', isActive: true },
    });
    permUserCreate = await prisma.permission.create({
      data: { name: 'users:create', displayName: 'Create User', resource: 'user', action: 'create', isActive: true },
    });
    permArticleRead = await prisma.permission.create({
      data: { name: 'articles:read', displayName: 'Read Articles', resource: 'article', action: 'read', isActive: true },
    });
    permArticleEdit = await prisma.permission.create({
      data: { name: 'articles:edit', displayName: 'Edit Articles', resource: 'article', action: 'edit', isActive: true },
    });
    // Inactive permission
    await prisma.permission.create({
      data: { name: 'reports:generate', displayName: 'Generate Reports', resource: 'report', action: 'generate', isActive: false },
    });


    // 2. Roles
    roleAdmin = await prisma.role.create({
      data: { name: 'admin_role', displayName: 'Administrator', isActive: true },
    });
    roleEditor = await prisma.role.create({
      data: { name: 'editor_role', displayName: 'Editor', isActive: true },
    });
    roleViewer = await prisma.role.create({
      data: { name: 'viewer_role', displayName: 'Viewer', isActive: true },
    });
    // Inactive role
    await prisma.role.create({
        data: { name: 'legacy_role', displayName: 'Legacy Role', isActive: false },
      });


    // 3. Role-Permission Assignments
    // Admin: all tested active permissions
    await prisma.rolePermission.createMany({
      data: [
        { roleId: roleAdmin.id, permissionId: permUserList.id },
        { roleId: roleAdmin.id, permissionId: permUserCreate.id },
        { roleId: roleAdmin.id, permissionId: permArticleRead.id },
        { roleId: roleAdmin.id, permissionId: permArticleEdit.id },
      ],
    });
    // Editor: article read/edit
    await prisma.rolePermission.createMany({
      data: [
        { roleId: roleEditor.id, permissionId: permArticleRead.id },
        { roleId: roleEditor.id, permissionId: permArticleEdit.id },
      ],
    });
    // Viewer: article read
    await prisma.rolePermission.create({
      data: { roleId: roleViewer.id, permissionId: permArticleRead.id },
    });
    // Assign active 'reports:generate' (which is inactive) to legacy_role (which is inactive)
    const inactivePerm = await prisma.permission.findFirst({where: {name: 'reports:generate'}});
    const inactiveRole = await prisma.role.findFirst({where: {name: 'legacy_role'}});
    if(inactivePerm && inactiveRole) {
        await prisma.rolePermission.create({data: {roleId: inactiveRole.id, permissionId: inactivePerm.id}});
    }


    // 4. Users
    user1 = await prisma.user.create({ data: { username: 'userOne', passwordHash: 'hash1', isActive: true } });
    user2 = await prisma.user.create({ data: { username: 'userTwo', passwordHash: 'hash2', isActive: true } });
    adminUser = await prisma.user.create({ data: { username: 'adminUserPerm', passwordHash: 'hash3', isActive: true } });
    // Inactive user
    await prisma.user.create({ data: { username: 'inactiveUserPerm', passwordHash: 'hash4', isActive: false } });

    // 5. User-Role Assignments
    // User1: Editor
    await prisma.userRole.create({ data: { userId: user1.id, roleId: roleEditor.id } });
    // User2: Viewer and also Editor (overlapping)
    await prisma.userRole.create({ data: { userId: user2.id, roleId: roleViewer.id } });
    await prisma.userRole.create({ data: { userId: user2.id, roleId: roleEditor.id } }); // User2 is both Viewer and Editor
    // AdminUser: Admin
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: roleAdmin.id } });
    // Assign active role to inactive user
    const inactiveUsr = await prisma.user.findFirst({where: {username: 'inactiveUserPerm'}});
    if(inactiveUsr) {
        await prisma.userRole.create({data: {userId: inactiveUsr.id, roleId: roleAdmin.id}});
    }
    // Assign inactive role to active user
    if(inactiveRole) {
        await prisma.userRole.create({data: {userId: user1.id, roleId: inactiveRole.id}});
    }
  });

  afterEach(async () => {
    // More thorough cleanup of manually created data might be needed if not using prefixes or TestDataManager for all
    // For now, relying on TestDataManager's prefix cleanup if it were used for these,
    // but since these are created directly with Prisma, they need manual cleanup or rely on beforeAll.
    // The `setupTestDb` in `beforeAll` should handle clearing tables.
    // However, specific cache clearing for users tested is good practice.
    await service.clearUserPermissionCache(user1.id);
    await service.clearUserPermissionCache(user2.id);
    await service.clearUserPermissionCache(adminUser.id);
    const inactiveUsr = await prisma.user.findFirst({where: {username: 'inactiveUserPerm'}});
    if(inactiveUsr) await service.clearUserPermissionCache(inactiveUsr.id);

    // Clean up data to prevent test interference
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.permission.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await teardownTestDb(); // Final full cleanup
  });

  describe('checkPermission (hasPermission equivalent)', () => {
    it('should return true if user has permission via a role', async () => {
      expect(await service.checkPermission(user1.id, 'articles:edit')).toBe(true); // User1 is Editor
      expect(await service.checkPermission(user1.id, 'articles:read')).toBe(true);
    });

    it('should return false if user does not have permission', async () => {
      expect(await service.checkPermission(user1.id, 'users:create')).toBe(false); // User1 is Editor, cannot create users
    });

    it('should return true if user has permission via one of multiple roles', async () => {
      // User2 is Viewer (read articles) and Editor (read/edit articles)
      expect(await service.checkPermission(user2.id, 'articles:edit')).toBe(true);
    });

    it('should handle admin user having all seeded permissions', async () => {
      expect(await service.checkPermission(adminUser.id, 'users:list')).toBe(true);
      expect(await service.checkPermission(adminUser.id, 'users:create')).toBe(true);
      expect(await service.checkPermission(adminUser.id, 'articles:read')).toBe(true);
      expect(await service.checkPermission(adminUser.id, 'articles:edit')).toBe(true);
    });

    it('should return false for a non-existent permission name', async () => {
      expect(await service.checkPermission(user1.id, 'non:existent:permission')).toBe(false);
    });

    it('should return false if permission is inactive', async () => {
        // Grant admin role (which has reports:generate via legacy_role potentially)
        // For this test, let's ensure a direct path to an inactive permission
        const tempRole = await prisma.role.create({data: {name: 'temp_role_for_inactive_perm_test', isActive: true}});
        const inactivePerm = await prisma.permission.findFirst({where: {name: 'reports:generate'}});
        if(!inactivePerm) throw new Error("Inactive permission not found for test");
        await prisma.rolePermission.create({data: {roleId: tempRole.id, permissionId: inactivePerm.id}});
        await prisma.userRole.create({data: {userId: user1.id, roleId: tempRole.id}});

        // Clear cache for user1 as we modified their roles/permissions
        await service.clearUserPermissionCache(user1.id);

        expect(await service.checkPermission(user1.id, 'reports:generate')).toBe(false);
    });

    it('should return false if user is inactive, even if roles grant permission', async () => {
        const inactiveUsr = await prisma.user.findFirst({where: {username: 'inactiveUserPerm'}});
        if(!inactiveUsr) throw new Error("Inactive user not found for test");
        // inactiveUserPerm is assigned roleAdmin which has 'users:list'
        expect(await service.checkPermission(inactiveUsr.id, 'users:list')).toBe(false);
    });

    it('should return false if role granting permission is inactive', async () => {
        const userWithInactiveRole = await prisma.user.create({data: {username: 'user_with_inactive_role', passwordHash: 'pw', isActive: true}});
        const inactiveRole = await prisma.role.findFirst({where: {name: 'legacy_role'}}); // legacy_role is inactive
        if(!inactiveRole) throw new Error("Inactive role not found for test");

        // Assign an active permission to this inactive role (reports:generate is inactive, let's use an active one)
        await prisma.rolePermission.create({data: {roleId: inactiveRole.id, permissionId: permUserList.id}});
        await prisma.userRole.create({data: {userId: userWithInactiveRole.id, roleId: inactiveRole.id}});

        await service.clearUserPermissionCache(userWithInactiveRole.id);
        expect(await service.checkPermission(userWithInactiveRole.id, permUserList.name)).toBe(false);
    });

    it('should use cache: second call for same user should be faster (qualitative)', async () => {
      await service.checkPermission(user1.id, 'articles:read'); // Populate cache
      // Subsequent calls for user1's permissions should hit the cache in PermissionService
      // This test is hard to quantify precisely without deeper mocking or timing checks,
      // but it ensures the path is exercised.
      expect(await service.checkPermission(user1.id, 'articles:read')).toBe(true);
    });
  });

  describe('getUserEffectivePermissions (getUserPermissions equivalent)', () => {
    it('should return all unique permissions for a user with multiple roles', async () => {
      const permissionsUser2 = await service.getUserEffectivePermissions(user2.id); // Viewer + Editor
      // Expected: articles:read (from Viewer & Editor), articles:edit (from Editor)
      expect(permissionsUser2).toBeInstanceOf(Set);
      expect(permissionsUser2.size).toBe(2);
      expect(permissionsUser2.has('articles:read')).toBe(true);
      expect(permissionsUser2.has('articles:edit')).toBe(true);
      expect(permissionsUser2.has('users:list')).toBe(false);
    });

    it('should return all permissions for an admin user', async () => {
      const permissionsAdmin = await service.getUserEffectivePermissions(adminUser.id);
      expect(permissionsAdmin.size).toBe(4); // users:list, users:create, articles:read, articles:edit
      expect(permissionsAdmin.has('users:list')).toBe(true);
      expect(permissionsAdmin.has('users:create')).toBe(true);
      expect(permissionsAdmin.has('articles:read')).toBe(true);
      expect(permissionsAdmin.has('articles:edit')).toBe(true);
    });

    it('should return an empty set for a user with no roles or no permissions', async () => {
      const userNoRoles = await prisma.user.create({ data: { username: 'userNoRoles', passwordHash: 'hash', isActive: true } });
      const permissions = await service.getUserEffectivePermissions(userNoRoles.id);
      expect(permissions.size).toBe(0);
    });

    it('should return an empty set for an inactive user', async () => {
        const inactiveUsr = await prisma.user.findFirst({where: {username: 'inactiveUserPerm'}});
        if(!inactiveUsr) throw new Error("Inactive user not found");
        const permissions = await service.getUserEffectivePermissions(inactiveUsr.id);
        expect(permissions.size).toBe(0);
    });

    it('should not include permissions from inactive roles or inactive permission records', async () => {
        // user1 is assigned 'editor_role' (active) and 'legacy_role' (inactive)
        // 'legacy_role' was (hypothetically) assigned 'reports:generate' (inactive perm) and 'users:list' (active perm)
        // 'editor_role' has 'articles:read', 'articles:edit'

        // Ensure 'legacy_role' is linked to user1
        const legacyRole = await prisma.role.findFirst({where: {name: 'legacy_role'}});
        if (!legacyRole) throw new Error("Legacy role not found");
        // Ensure it has an active permission that shouldn't appear
        await prisma.rolePermission.create({data: {roleId: legacyRole.id, permissionId: permUserCreate.id }});


        await service.clearUserPermissionCache(user1.id); // Clear cache due to new role assignment for user1
        const permissionsUser1 = await service.getUserEffectivePermissions(user1.id);

        expect(permissionsUser1.has('articles:read')).toBe(true); // From active Editor role
        expect(permissionsUser1.has('articles:edit')).toBe(true);  // From active Editor role
        expect(permissionsUser1.has('reports:generate')).toBe(false); // Because permission itself is inactive
        expect(permissionsUser1.has(permUserCreate.name)).toBe(false); // Because legacy_role is inactive
        expect(permissionsUser1.size).toBe(2); // Only from Editor role
    });
  });
});
