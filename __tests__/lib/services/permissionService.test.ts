// __tests__/lib/services/permissionService.test.ts
// 单元测试权限服务
// Unit tests for PermissionService.

import { prisma } from '@/lib/prisma';
import { PermissionService } from '../../lib/services/permissionService'; // Adjust path
import { User, Role, Permission, UserRole } from '@prisma/client';

// Mock Prisma client
// 模拟 Prisma 客户端
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    // We don't need to mock role and permission directly as they are accessed via user include
  },
}));

// Default cache TTL for service if not overridden
const DEFAULT_CACHE_TTL_MS = 60 * 1000; // Assuming 1 minute default from service implementation

describe('PermissionService', () => {
  let permissionService: PermissionService;

  // Mock data
  // 模拟数据
  const mockPermission1: Permission = { id: 'perm-1', name: 'read:data', description: 'Read data', isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const mockPermission2: Permission = { id: 'perm-2', name: 'write:data', description: 'Write data', isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const mockPermission3: Permission = { id: 'perm-3', name: 'delete:data', description: 'Delete data', isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const mockPermissionInactive: Permission = { id: 'perm-inactive', name: 'manage:users_inactive', description: 'Inactive manage users', isActive: false, createdAt: new Date(), updatedAt: new Date() };

  const mockRole1: Role & { permissions: Permission[] } = {
    id: 'role-1', name: 'Administrator', description: 'Admin role', isActive: true, createdAt: new Date(), updatedAt: new Date(),
    permissions: [mockPermission1, mockPermission2, mockPermission3],
  };
  const mockRole2: Role & { permissions: Permission[] } = {
    id: 'role-2', name: 'Editor', description: 'Editor role', isActive: true, createdAt: new Date(), updatedAt: new Date(),
    permissions: [mockPermission1, mockPermission2, mockPermissionInactive], // Includes inactive permission
  };
  const mockRoleInactive: Role & { permissions: Permission[] } = {
    id: 'role-inactive', name: 'Inactive Role', description: 'Inactive role', isActive: false, createdAt: new Date(), updatedAt: new Date(),
    permissions: [mockPermission1],
  };

  // Simulating the structure Prisma returns for includes
  const mockUserRoleActive1 = {
    id: 'userrole-1', userId: 'user-1', roleId: 'role-1', assignedAt: new Date(), expiresAt: null, isActive: true,
    role: mockRole1,
  };
  const mockUserRoleActive2 = {
    id: 'userrole-2', userId: 'user-1', roleId: 'role-2', assignedAt: new Date(), expiresAt: new Date(Date.now() + 3600 * 1000), isActive: true, // Expires in future
    role: mockRole2,
  };
  const mockUserRoleExpired = {
    id: 'userrole-expired', userId: 'user-1', roleId: 'role-1', assignedAt: new Date(), expiresAt: new Date(Date.now() - 1000), isActive: true, // Expired
    role: mockRole1,
  };
   const mockUserRoleInactiveAssignment = {
    id: 'userrole-inactive-assign', userId: 'user-1', roleId: 'role-1', assignedAt: new Date(), expiresAt: null, isActive: false, // UserRole assignment itself is inactive
    role: mockRole1,
  };
  const mockUserRoleWithInactiveRole = {
    id: 'userrole-3', userId: 'user-1', roleId: 'role-inactive', assignedAt: new Date(), expiresAt: null, isActive: true,
    role: mockRoleInactive,
  };


  beforeEach(() => {
    jest.clearAllMocks();
    // Create a new service instance for each test to reset cache, or use clearAllCache method if available
    permissionService = new PermissionService({ cacheTTL: DEFAULT_CACHE_TTL_MS });
    // Ensure fake timers are reset if used in a test
    jest.useRealTimers();
  });

  describe('getUserEffectivePermissions', () => {
    const testUserId = 'user-active-test';

    // Helper to create a mock user object for Prisma findUnique
    const createMockUser = (id: string, isActiveFlag: boolean, roles: any[]) => ({
        id: id,
        email: `${id}@example.com`,
        isActive: isActiveFlag,
        name: `User ${id}`,
        passwordHash: 'hashedpassword',
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: roles, // This is the key part for the include
    });


    it('应在用户未找到时返回空集合 // Should return empty set if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set());
      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: testUserId },
        include: expect.any(Object), // Check that include is used
      }));
    });

    it('应在用户非活动时返回空集合 // Should return empty set if user is inactive', async () => {
      const mockUserInactive = createMockUser(testUserId, false, []);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserInactive);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set());
    });

    it('用户没有角色时应返回空集合 // Should return empty set if user has no roles', async () => {
      const mockUserNoRoles = createMockUser(testUserId, true, []);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserNoRoles);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set());
    });

    it('用户有活动角色但角色没有权限时应返回空集合 // Should return empty set if user has active roles but roles have no permissions', async () => {
       const roleWithNoPerms: Role & { permissions: Permission[] } = { ...mockRole1, permissions: [] };
       const userRoleWithNoPerms = { ...mockUserRoleActive1, role: roleWithNoPerms };
       const mockUser = createMockUser(testUserId, true, [userRoleWithNoPerms]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set());
    });

    it('应返回来自活动且未过期的用户角色的活动权限 // Should return active permissions from active, non-expired user roles', async () => {
      const mockUser = createMockUser(testUserId, true, [mockUserRoleActive1]); // Role1 has perm1, perm2, perm3
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set([mockPermission1.name, mockPermission2.name, mockPermission3.name]));
    });

    it('应忽略不活动的权限、不活动的角色、不活动的用户角色分配和过期的用户角色 // Should ignore inactive permissions, inactive roles, inactive UserRole assignments, and expired user roles', async () => {
      const mockUser = createMockUser(testUserId, true, [
          mockUserRoleActive2, // Role2 has perm1, perm2 (active), perm_inactive (inactive)
          mockUserRoleExpired, // Expired
          mockUserRoleWithInactiveRole, // Role is inactive
          mockUserRoleInactiveAssignment, // UserRole assignment itself is inactive
        ]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      // Only perm1 and perm2 from mockUserRoleActive2 should be present
      expect(permissions).toEqual(new Set([mockPermission1.name, mockPermission2.name]));
    });

    it('应合并来自多个活动角色的权限并去重 // Should merge and deduplicate permissions from multiple active roles', async () => {
       const role3Data: Role & { permissions: Permission[] } = {
        id: 'role-3', name: 'Viewer', description: 'Viewer role', isActive: true, createdAt: new Date(), updatedAt: new Date(),
        permissions: [mockPermission1, {id: 'perm-4', name: 'view:settings', description: '', isActive: true, createdAt: new Date(), updatedAt: new Date()}],
      };
      const userRole3 = {
        id: 'userrole-4', userId: testUserId, roleId: 'role-3', assignedAt: new Date(), expiresAt: null, isActive: true,
        role: role3Data,
      };
       const mockUser = createMockUser(testUserId, true, [mockUserRoleActive1, userRole3]); // Role1 (p1,p2,p3), Role3 (p1, p4)
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const permissions = await permissionService.getUserEffectivePermissions(testUserId);
      expect(permissions).toEqual(new Set([mockPermission1.name, mockPermission2.name, mockPermission3.name, 'view:settings']));
    });
     it('如果Prisma调用失败，应抛出错误 // Should throw an error if Prisma call fails', async () => {
      const dbError = new Error('Prisma DB Error');
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(dbError);
      await expect(permissionService.getUserEffectivePermissions(testUserId)).rejects.toThrow(dbError);
    });
  });

  describe('Caching', () => {
    const userId = 'cache-user-id';
    const mockUserForCache = { // Using a simplified mock structure here, assuming createMockUser can be adapted or use a specific one
        id: userId, email: 'test@example.com', isActive: true, name: 'Test User', passwordHash: '', emailVerified: null, createdAt: new Date(), updatedAt: new Date(),
        roles: [mockUserRoleActive1], // perm1, perm2, perm3
    };
    const expectedPermissions = new Set([mockPermission1.name, mockPermission2.name, mockPermission3.name]);

    beforeEach(() => {
      jest.useFakeTimers();
      // Reset service instance with specific TTL for caching tests if needed, or rely on default
      // permissionService = new PermissionService({ cacheTTL: DEFAULT_CACHE_TTL_MS });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserForCache);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('首次调用应查询Prisma并将结果存入缓存 // First call should query Prisma and store result in cache', async () => {
      const perms = await permissionService.getUserEffectivePermissions(userId);
      expect(perms).toEqual(expectedPermissions);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

      // 第二次调用，应从缓存获取
      // Second call, should get from cache
      const cachedPerms = await permissionService.getUserEffectivePermissions(userId);
      expect(cachedPerms).toEqual(expectedPermissions);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1); // Prisma未再次调用
                                                              // Prisma not called again
    });

    it('缓存过期后应再次查询Prisma // Should query Prisma again after cache expires', async () => {
      await permissionService.getUserEffectivePermissions(userId); // 填充缓存
                                                                  // Populate cache
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(DEFAULT_CACHE_TTL_MS + 1); // 使缓存过期
                                                          // Expire cache

      await permissionService.getUserEffectivePermissions(userId); // 再次获取
                                                                  // Fetch again
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2); // Prisma应再次调用
                                                              // Prisma should be called again
    });

    it('clearUserPermissionCache 应清除特定用户的缓存 // clearUserPermissionCache should clear cache for a specific user', async () => {
      await permissionService.getUserEffectivePermissions(userId); // 填充缓存
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

      permissionService.clearUserPermissionCache(userId); // 清除缓存
                                                         // Clear cache

      await permissionService.getUserEffectivePermissions(userId); // 再次获取
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2); // Prisma应再次调用
    });

    it('clearUserPermissionCache 不应影响其他用户的缓存 // clearUserPermissionCache should not affect other users cache', async () => {
      const userId2 = 'cache-user-id-2';
      const mockUser2ForCache = {...mockUserForCache, id: userId2, roles: [mockUserRoleActive2]}; // Different roles/perms

      // Mock different return values for different calls
      const findUniqueMock = prisma.user.findUnique as jest.Mock;
      findUniqueMock.mockResolvedValueOnce(mockUserForCache); // For userId call 1
      findUniqueMock.mockResolvedValueOnce(mockUser2ForCache); // For userId2 call 1
      findUniqueMock.mockResolvedValueOnce(mockUserForCache); // For userId call 2 (after cache clear)
      // userId2's second call should still be cached, so no fourth DB call needed for this test path


      await permissionService.getUserEffectivePermissions(userId); // User 1 - populate cache
      await permissionService.getUserEffectivePermissions(userId2); // User 2 - populate cache
      expect(findUniqueMock).toHaveBeenCalledTimes(2);

      permissionService.clearUserPermissionCache(userId); // Clear cache for User 1

      await permissionService.getUserEffectivePermissions(userId); // User 1 - should hit DB
      expect(findUniqueMock).toHaveBeenCalledTimes(3);

      await permissionService.getUserEffectivePermissions(userId2); // User 2 - should be from cache
      expect(findUniqueMock).toHaveBeenCalledTimes(3); // Still 3, not 4
    });
  });

  describe('checkPermission', () => {
    const userId = 'check-perm-user';
    // 在这里模拟 getUserEffectivePermissions，使其更容易测试 checkPermission 的逻辑
    // Mock getUserEffectivePermissions here to make testing checkPermission logic easier
    let getUserEffectivePermissionsSpy: jest.SpyInstance;

    beforeEach(() => {
        // Spy on the instance method
        getUserEffectivePermissionsSpy = jest.spyOn(permissionService, 'getUserEffectivePermissions');
    });

    afterEach(() => {
        getUserEffectivePermissionsSpy.mockRestore();
    });

    it('当用户拥有所需权限时应返回true // Should return true if user has the required permission', async () => {
      getUserEffectivePermissionsSpy.mockResolvedValue(new Set(['read:config', 'write:config']));
      const hasPerm = await permissionService.checkPermission(userId, 'read:config');
      expect(hasPerm).toBe(true);
      expect(getUserEffectivePermissionsSpy).toHaveBeenCalledWith(userId);
    });

    it('当用户没有所需权限时应返回false // Should return false if user does not have the required permission', async () => {
      getUserEffectivePermissionsSpy.mockResolvedValue(new Set(['read:config']));
      const hasPerm = await permissionService.checkPermission(userId, 'write:config');
      expect(hasPerm).toBe(false);
    });

    it('当所需权限为空字符串或未定义时应返回true（策略性）// Should return true if requiredPermission is empty or undefined (strategic decision)', async () => {
      getUserEffectivePermissionsSpy.mockResolvedValue(new Set(['read:config'])); // User has some perms
      expect(await permissionService.checkPermission(userId, '')).toBe(true);
      expect(await permissionService.checkPermission(userId, undefined as any)).toBe(true);
       // 确保即使权限为空，也尝试获取用户权限（例如，用于审计或确保用户是活动的）
       // Ensure user permissions are still fetched even if permission is empty (e.g. for auditing or ensuring user is active)
      expect(getUserEffectivePermissionsSpy).toHaveBeenCalledTimes(2);
    });
     it('如果 getUserEffectivePermissions 失败，则应传播错误 // Should propagate error if getUserEffectivePermissions fails', async () => {
      const permError = new Error('Failed to get permissions');
      getUserEffectivePermissionsSpy.mockRejectedValue(permError);
      await expect(permissionService.checkPermission(userId, 'read:config')).rejects.toThrow(permError);
    });
  });

  describe('checkBatchPermissions', () => {
    const userId = 'batch-check-user';
    let getUserEffectivePermissionsSpy: jest.SpyInstance;

    beforeEach(() => {
        getUserEffectivePermissionsSpy = jest.spyOn(permissionService, 'getUserEffectivePermissions');
    });
    afterEach(() => {
        getUserEffectivePermissionsSpy.mockRestore();
    });

    it('应正确返回批量权限检查结果 // Should correctly return batch permission check results', async () => {
      getUserEffectivePermissionsSpy.mockResolvedValue(new Set(['perm_a', 'perm_c']));
      const requests = [
        { name: 'req1', permission: 'perm_a' },
        { name: 'req2', permission: 'perm_b' },
        { name: 'req3', permission: 'perm_c' },
        { name: 'req4', permission: '' }, // 空权限，应为true
                                          // Empty permission, should be true
        { name: 'req5', permission: undefined as any }, // 未定义权限，应为true
                                                      // Undefined permission, should be true
      ];
      const results = await permissionService.checkBatchPermissions(userId, requests);
      expect(results).toEqual([
        { name: 'req1', permission: 'perm_a', isAllowed: true },
        { name: 'req2', permission: 'perm_b', isAllowed: false },
        { name: 'req3', permission: 'perm_c', isAllowed: true },
        { name: 'req4', permission: '', isAllowed: true },
        { name: 'req5', permission: undefined, isAllowed: true },
      ]);
      expect(getUserEffectivePermissionsSpy).toHaveBeenCalledWith(userId);
    });

    it('如果请求数组为空，则应返回空数组 // Should return empty array if requests array is empty', async () => {
      const results = await permissionService.checkBatchPermissions(userId, []);
      expect(results).toEqual([]);
      // 不应调用 getUserEffectivePermissions，因为没有要检查的权限
      // getUserEffectivePermissions should not be called as there are no permissions to check
      expect(getUserEffectivePermissionsSpy).not.toHaveBeenCalled();
    });

    it('如果请求中的name缺失，应仍处理该请求 // Should still process requests with missing names', async () => {
      getUserEffectivePermissionsSpy.mockResolvedValue(new Set(['perm_a']));
      const requests = [ { permission: 'perm_a' } as any ]; // 缺少 name
                                                            // Missing name
      const results = await permissionService.checkBatchPermissions(userId, requests);
      expect(results).toEqual([ { name: undefined, permission: 'perm_a', isAllowed: true } ]);
    });

    it('如果 getUserEffectivePermissions 失败，则应传播错误 // Should propagate error if getUserEffectivePermissions fails', async () => {
      const permError = new Error('Failed to get permissions for batch');
      getUserEffectivePermissionsSpy.mockRejectedValue(permError);
      const requests = [{ name: 'req1', permission: 'perm_a' }];
      await expect(permissionService.checkBatchPermissions(userId, requests)).rejects.toThrow(permError);
    });
  });
});
