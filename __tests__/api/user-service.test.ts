/**
 * UserService 单元测试
 * 测试用户管理服务的所有功能
 */

import {
  UserService,
  CreateUserParams,
  UpdateUserParams,
  UserQueryParams,
} from '../../apps/oauth-service/lib/services/user-service';
import { prisma } from '@repo/database';
import { AuthorizationUtils } from '@repo/lib/auth';
import bcrypt from 'bcrypt';

// Mock 外部依赖
jest.mock('@repo/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('@repo/lib/auth', () => ({
  AuthorizationUtils: {
    logAuditEvent: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

const mockPrisma = prisma as any;
const mockAuthUtils = AuthorizationUtils as any;
const mockBcrypt = bcrypt as any;

describe('UserService', () => {
  // 测试数据
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    organization: 'Test Org',
    department: 'IT',
    isActive: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    lockedUntil: null,
    createdBy: 'admin-123',
    avatar: null,
  };

  const auditInfo = {
    userId: 'admin-123',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('应该成功创建用户', async () => {
      const createParams: CreateUserParams = {
        username: 'newuser',
        password: 'Password123',
        displayName: 'New User',
        firstName: 'New',
        lastName: 'User',
        organization: 'Test Org',
        department: 'IT',
        isActive: true,
        mustChangePassword: true,
        createdBy: 'admin-123',
      };

      // Mock 返回值
      mockPrisma.user.findUnique.mockResolvedValue(null); // 用户不存在
      mockBcrypt.hash.mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockAuthUtils.logAuditEvent.mockResolvedValue(undefined);

      const result = await UserService.createUser(createParams, auditInfo);

      // 验证调用
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'newuser' },
      });
      expect(mockBcrypt.hash).toHaveBeenCalledWith('Password123', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'newuser',
          passwordHash: 'hashed-password',
          displayName: 'New User',
          firstName: 'New',
          lastName: 'User',
          organization: 'Test Org',
          department: 'IT',
          isActive: true,
          mustChangePassword: true,
          createdBy: 'admin-123',
          failedLoginAttempts: 0,
        },
      });
      expect(mockAuthUtils.logAuditEvent).toHaveBeenCalledWith({
        userId: 'admin-123',
        action: 'user_created',
        resource: 'user:user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        metadata: {
          username: 'newuser',
          organization: 'Test Org',
          department: 'IT',
        },
      });

      // 验证结果不包含密码哈希
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.username).toBe('testuser');
    });

    it('当用户名已存在时应该抛出错误', async () => {
      const createParams: CreateUserParams = {
        username: 'existinguser',
        password: 'Password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockAuthUtils.logAuditEvent.mockResolvedValue(undefined);

      await expect(UserService.createUser(createParams, auditInfo)).rejects.toThrow(
        '用户名 "existinguser" 已存在'
      );

      expect(mockAuthUtils.logAuditEvent).toHaveBeenCalledWith({
        userId: 'admin-123',
        action: 'user_create_failed_conflict',
        resource: 'user:existinguser',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: false,
        errorMessage: 'Username "existinguser" already exists.',
        metadata: { username: 'existinguser' },
      });
    });

    it('当用户名过短时应该抛出验证错误', async () => {
      const createParams: CreateUserParams = {
        username: 'ab', // 过短
        password: 'Password123',
      };

      await expect(UserService.createUser(createParams, auditInfo)).rejects.toThrow(
        '用户名至少需要3个字符'
      );
    });

    it('当密码不符合要求时应该抛出验证错误', async () => {
      const createParams: CreateUserParams = {
        username: 'validuser',
        password: '123', // 过短且不包含字母
      };

      await expect(UserService.createUser(createParams, auditInfo)).rejects.toThrow(
        '密码至少需要8个字符'
      );
    });

    it('当密码只包含数字时应该抛出验证错误', async () => {
      const createParams: CreateUserParams = {
        username: 'validuser',
        password: '12345678', // 只包含数字
      };

      await expect(UserService.createUser(createParams, auditInfo)).rejects.toThrow(
        '密码必须包含至少一个字母和一个数字'
      );
    });
  });

  describe('getUserById', () => {
    it('应该成功获取用户信息', async () => {
      const userWithRoles = {
        ...mockUser,
        userRoles: [
          {
            role: {
              id: 'role-1',
              name: 'admin',
              rolePermissions: [
                {
                  permission: {
                    id: 'perm-1',
                    name: 'user:read',
                  },
                },
              ],
            },
          },
        ],
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithRoles);

      const result = await UserService.getUserById('user-123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result?.username).toBe('testuser');
    });

    it('当用户不存在时应该返回null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await UserService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUsers', () => {
    it('应该成功获取用户列表', async () => {
      const queryParams: UserQueryParams = {
        limit: 10,
        offset: 0,
        search: 'test',
        isActive: true,
      };

      const mockUsers = [mockUser];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await UserService.getUsers(queryParams);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { username: { contains: 'test', mode: 'insensitive' } },
            { displayName: { contains: 'test', mode: 'insensitive' } },
            { firstName: { contains: 'test', mode: 'insensitive' } },
            { lastName: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          organization: true,
          department: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          mustChangePassword: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          createdBy: true,
          avatar: true,
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('应该正确处理组织过滤', async () => {
      const queryParams: UserQueryParams = {
        organization: 'Test Org',
      };

      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await UserService.getUsers(queryParams);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: {
              contains: 'Test Org',
              mode: 'insensitive',
            },
          },
        })
      );
    });
  });

  describe('updateUser', () => {
    it('应该成功更新用户信息', async () => {
      const updateParams: UpdateUserParams = {
        displayName: 'Updated Name',
        organization: 'New Org',
        isActive: false,
      };

      // Mock 用户存在
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        displayName: 'Updated Name',
        organization: 'New Org',
        isActive: false,
      });
      mockAuthUtils.logAuditEvent.mockResolvedValue(undefined);

      const result = await UserService.updateUser('user-123', updateParams, auditInfo);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          displayName: 'Updated Name',
          organization: 'New Org',
          isActive: false,
        },
      });

      expect(mockAuthUtils.logAuditEvent).toHaveBeenCalledWith({
        userId: 'admin-123',
        action: 'user_updated',
        resource: 'user:user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        metadata: {
          updatedFields: ['displayName', 'organization', 'isActive'],
          targetUserId: 'user-123',
        },
      });

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('当用户不存在时应该抛出错误', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(UserService.updateUser('nonexistent', {}, auditInfo)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('deleteUser', () => {
    it('应该成功删除用户（软删除）', async () => {
      // Mock 用户存在
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      mockAuthUtils.logAuditEvent.mockResolvedValue(undefined);

      await UserService.deleteUser('user-123', auditInfo);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          isActive: false,
        },
      });

      expect(mockAuthUtils.logAuditEvent).toHaveBeenCalledWith({
        userId: 'admin-123',
        action: 'user_deleted',
        resource: 'user:user-123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true,
        metadata: {
          targetUserId: 'user-123',
          targetUsername: 'testuser',
        },
      });
    });

    it('当用户不存在时应该抛出错误', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(UserService.deleteUser('nonexistent', auditInfo)).rejects.toThrow(
        'User not found'
      );
    });

    it('当尝试删除自己时应该抛出错误', async () => {
      await expect(UserService.deleteUser('admin-123', auditInfo)).rejects.toThrow(
        'Cannot delete your own account'
      );
    });
  });

  describe('参数验证', () => {
    it('应该验证用户名格式', async () => {
      const invalidUsernames = [
        '$$invalid$$', // 包含特殊字符
        'a'.repeat(51), // 超过50个字符
      ];

      for (const username of invalidUsernames) {
        await expect(
          UserService.createUser({ username, password: 'Password123' }, auditInfo)
        ).rejects.toThrow();
      }
    });

    it('应该验证显示名称长度', async () => {
      const longDisplayName = 'a'.repeat(101); // 超过100个字符

      await expect(
        UserService.updateUser('user-123', { displayName: longDisplayName }, auditInfo)
      ).rejects.toThrow('显示名称不能超过100个字符');
    });
  });
});
