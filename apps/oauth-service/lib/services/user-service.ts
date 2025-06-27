/**
 * 用户管理服务类
 * User Management Service Class
 *
 * 提供完整的用户CRUD操作、密码管理、权限控制
 * Provides complete user CRUD operations, password management, and access control
 *
 * @author OAuth团队
 * @since 1.0.0
 */

import { User } from '@prisma/client';
import { prisma } from '@repo/database';
import { AuthorizationUtils } from '@repo/lib/auth';
import { OAuth2Error, OAuth2ErrorCode } from '../errors';
import bcrypt from 'bcrypt';

/**
 * 用户创建参数接口
 * User creation parameters interface
 */
export interface CreateUserParams {
  username: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  department?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  createdBy?: string;
}

/**
 * 用户更新参数接口
 * User update parameters interface
 */
export interface UpdateUserParams {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  department?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  avatar?: string;
}

/**
 * 用户密码更新参数接口
 * User password update parameters interface
 */
export interface UpdatePasswordParams {
  currentPassword?: string; // 当前密码（用户自己修改时需要）
  newPassword: string;
  mustChangePassword?: boolean;
}

/**
 * 用户查询参数接口
 * User query parameters interface
 */
export interface UserQueryParams {
  username?: string;
  organization?: string;
  department?: string;
  isActive?: boolean;
  search?: string; // 搜索用户名、显示名称、姓名
  limit?: number;
  offset?: number;
}

/**
 * 用户管理服务
 * User Management Service
 *
 * 采用静态方法模式，提供完整的用户管理功能
 * Uses static method pattern to provide complete user management functionality
 */
export class UserService {
  /**
   * 创建新用户
   * Create a new user
   *
   * @param params - 用户创建参数 (User creation parameters)
   * @param auditInfo - 审计信息 (Audit information)
   * @returns 创建的用户信息 (Created user information)
   */
  static async createUser(
    params: CreateUserParams,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<User> {
    try {
      // 验证参数
      // Validate parameters
      UserService.validateCreateParams(params);

      // 检查用户名是否已存在
      // Check if username already exists
      const existingUser = await prisma.user.findUnique({
        where: { username: params.username },
      });

      if (existingUser) {
        await AuthorizationUtils.logAuditEvent({
          userId: auditInfo.userId,
          action: 'user_create_failed_conflict',
          resource: `user:${params.username}`,
          ipAddress: auditInfo.ipAddress,
          userAgent: auditInfo.userAgent,
          success: false,
          errorMessage: `Username "${params.username}" already exists.`,
          metadata: { username: params.username },
        });

        throw new OAuth2Error(
          `用户名 "${params.username}" 已存在 (Username "${params.username}" already exists)`,
          OAuth2ErrorCode.InvalidRequest,
          409
        );
      }

      // 密码哈希处理
      // Password hashing
      const passwordHash = await bcrypt.hash(params.password, 12);

      // 创建用户记录
      // Create user record
      const user = await prisma.user.create({
        data: {
          username: params.username,
          passwordHash,
          displayName: params.displayName,
          firstName: params.firstName,
          lastName: params.lastName,
          organization: params.organization,
          department: params.department,
          isActive: params.isActive ?? true,
          mustChangePassword: params.mustChangePassword ?? true,
          createdBy: params.createdBy || auditInfo.userId,
          failedLoginAttempts: 0,
        },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_created',
        resource: `user:${user.id}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          username: params.username,
          organization: params.organization,
          department: params.department,
        },
      });

      // 返回用户信息（不包含密码哈希）
      // Return user information (excluding password hash)
      const { passwordHash: _, ...userWithoutPassword } = user;
      return userWithoutPassword as User;
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_create_failed',
        resource: `user:${params.username}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to create user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 根据ID获取用户信息
   * Get user information by ID
   *
   * @param userId - 用户ID (User ID)
   * @returns 用户信息 (User information)
   */
  static async getUserById(userId: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
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

      if (!user) {
        return null;
      }

      // 不返回密码哈希
      // Don't return password hash
      const { passwordHash: _, ...userWithoutPassword } = user;
      return userWithoutPassword as any;
    } catch (error) {
      throw new OAuth2Error(
        'Failed to retrieve user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 根据用户名获取用户信息
   * Get user information by username
   *
   * @param username - 用户名 (Username)
   * @returns 用户信息 (User information)
   */
  static async getUserByUsername(username: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        return null;
      }

      // 不返回密码哈希
      // Don't return password hash
      const { passwordHash: _, ...userWithoutPassword } = user;
      return userWithoutPassword as any;
    } catch (error) {
      throw new OAuth2Error(
        'Failed to retrieve user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 查询用户列表
   * Query user list
   *
   * @param params - 查询参数 (Query parameters)
   * @returns 用户列表和总数 (User list and total count)
   */
  static async getUsers(params: UserQueryParams = {}): Promise<{
    users: User[];
    total: number;
  }> {
    try {
      const where: any = {};

      if (params.username) {
        where.username = {
          contains: params.username,
          mode: 'insensitive',
        };
      }

      if (params.organization) {
        where.organization = {
          contains: params.organization,
          mode: 'insensitive',
        };
      }

      if (params.department) {
        where.department = {
          contains: params.department,
          mode: 'insensitive',
        };
      }

      if (params.isActive !== undefined) {
        where.isActive = params.isActive;
      }

      // 搜索功能：搜索用户名、显示名称、姓名
      // Search functionality: search username, display name, names
      if (params.search) {
        where.OR = [
          { username: { contains: params.search, mode: 'insensitive' } },
          { displayName: { contains: params.search, mode: 'insensitive' } },
          { firstName: { contains: params.search, mode: 'insensitive' } },
          { lastName: { contains: params.search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
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
            // 不选择 passwordHash
            // Don't select passwordHash
          },
          skip: params.offset ?? 0,
          take: params.limit ?? 50,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      return { users: users as User[], total };
    } catch (error) {
      throw new OAuth2Error(
        'Failed to query users',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 更新用户信息
   * Update user information
   *
   * @param userId - 用户ID (User ID)
   * @param params - 更新参数 (Update parameters)
   * @param auditInfo - 审计信息 (Audit information)
   * @returns 更新后的用户信息 (Updated user information)
   */
  static async updateUser(
    userId: string,
    params: UpdateUserParams,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<User> {
    try {
      // 检查用户是否存在
      // Check if user exists
      const existingUser = await UserService.getUserById(userId);
      if (!existingUser) {
        throw new OAuth2Error('User not found', OAuth2ErrorCode.InvalidRequest, 404);
      }

      // 验证更新参数
      // Validate update parameters
      UserService.validateUpdateParams(params);

      // 构建更新数据
      // Build update data
      const updateData: any = {};

      if (params.displayName !== undefined) updateData.displayName = params.displayName;
      if (params.firstName !== undefined) updateData.firstName = params.firstName;
      if (params.lastName !== undefined) updateData.lastName = params.lastName;
      if (params.organization !== undefined) updateData.organization = params.organization;
      if (params.department !== undefined) updateData.department = params.department;
      if (params.isActive !== undefined) updateData.isActive = params.isActive;
      if (params.mustChangePassword !== undefined)
        updateData.mustChangePassword = params.mustChangePassword;
      if (params.avatar !== undefined) updateData.avatar = params.avatar;

      // 执行更新
      // Execute update
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_updated',
        resource: `user:${updatedUser.id}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          updatedFields: Object.keys(updateData),
          targetUserId: userId,
        },
      });

      // 返回用户信息（不包含密码哈希）
      // Return user information (excluding password hash)
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword as User;
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_update_failed',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to update user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 更新用户密码
   * Update user password
   *
   * @param userId - 用户ID (User ID)
   * @param params - 密码更新参数 (Password update parameters)
   * @param auditInfo - 审计信息 (Audit information)
   */
  static async updatePassword(
    userId: string,
    params: UpdatePasswordParams,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      // 检查用户是否存在
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new OAuth2Error('User not found', OAuth2ErrorCode.InvalidRequest, 404);
      }

      // 如果提供了当前密码，验证其正确性
      // If current password is provided, verify its correctness
      if (params.currentPassword) {
        const isCurrentPasswordValid = await bcrypt.compare(
          params.currentPassword,
          existingUser.passwordHash
        );

        if (!isCurrentPasswordValid) {
          throw new OAuth2Error(
            'Current password is incorrect',
            OAuth2ErrorCode.InvalidRequest,
            400
          );
        }
      }

      // 验证新密码
      // Validate new password
      UserService.validatePassword(params.newPassword);

      // 密码哈希处理
      // Password hashing
      const newPasswordHash = await bcrypt.hash(params.newPassword, 12);

      // 更新密码
      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: params.mustChangePassword ?? false,
          failedLoginAttempts: 0, // 重置失败登录次数
          lockedUntil: null, // 解除锁定
        },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_password_updated',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          targetUserId: userId,
          byAdmin: auditInfo.userId !== userId,
        },
      });
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_password_update_failed',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to update user password',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 删除用户（软删除）
   * Delete user (soft delete)
   *
   * @param userId - 用户ID (User ID)
   * @param auditInfo - 审计信息 (Audit information)
   */
  static async deleteUser(
    userId: string,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      // 检查用户是否存在
      // Check if user exists
      const existingUser = await UserService.getUserById(userId);
      if (!existingUser) {
        throw new OAuth2Error('User not found', OAuth2ErrorCode.InvalidRequest, 404);
      }

      // 防止用户删除自己
      // Prevent user from deleting themselves
      if (userId === auditInfo.userId) {
        throw new OAuth2Error(
          'Cannot delete your own account',
          OAuth2ErrorCode.InvalidRequest,
          400
        );
      }

      // 软删除：设置为非活动状态
      // Soft delete: set to inactive status
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
        },
      });

      // 记录审计日志
      // Record audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_deleted',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          targetUserId: userId,
          targetUsername: existingUser.username,
        },
      });
    } catch (error) {
      // 记录失败的审计日志
      // Record failure audit log
      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_delete_failed',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof OAuth2Error) {
        throw error;
      }

      throw new OAuth2Error(
        'Failed to delete user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 锁定用户账户
   * Lock user account
   *
   * @param userId - 用户ID (User ID)
   * @param lockDuration - 锁定持续时间（分钟）(Lock duration in minutes)
   * @param auditInfo - 审计信息 (Audit information)
   */
  static async lockUser(
    userId: string,
    lockDuration: number = 30,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      const lockUntil = new Date(Date.now() + lockDuration * 60 * 1000);

      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: lockUntil,
        },
      });

      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_locked',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          targetUserId: userId,
          lockDuration,
          lockUntil: lockUntil.toISOString(),
        },
      });
    } catch (error) {
      throw new OAuth2Error(
        'Failed to lock user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 解锁用户账户
   * Unlock user account
   *
   * @param userId - 用户ID (User ID)
   * @param auditInfo - 审计信息 (Audit information)
   */
  static async unlockUser(
    userId: string,
    auditInfo: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: null,
          failedLoginAttempts: 0,
        },
      });

      await AuthorizationUtils.logAuditEvent({
        userId: auditInfo.userId,
        action: 'user_unlocked',
        resource: `user:${userId}`,
        ipAddress: auditInfo.ipAddress,
        userAgent: auditInfo.userAgent,
        success: true,
        metadata: {
          targetUserId: userId,
        },
      });
    } catch (error) {
      throw new OAuth2Error(
        'Failed to unlock user',
        OAuth2ErrorCode.ServerError,
        500,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * 验证用户创建参数
   * Validate user creation parameters
   *
   * @param params - 创建参数 (Creation parameters)
   */
  private static validateCreateParams(params: CreateUserParams): void {
    if (!params.username || params.username.trim().length < 3) {
      throw new OAuth2Error(
        '用户名至少需要3个字符 (Username must be at least 3 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (params.username.length > 50) {
      throw new OAuth2Error(
        '用户名不能超过50个字符 (Username cannot exceed 50 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(params.username)) {
      throw new OAuth2Error(
        '用户名只能包含字母、数字、下划线、点和连字符 (Username can only contain letters, numbers, underscores, dots, and hyphens)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    UserService.validatePassword(params.password);
  }

  /**
   * 验证用户更新参数
   * Validate user update parameters
   *
   * @param params - 更新参数 (Update parameters)
   */
  private static validateUpdateParams(params: UpdateUserParams): void {
    if (params.displayName !== undefined && params.displayName.length > 100) {
      throw new OAuth2Error(
        '显示名称不能超过100个字符 (Display name cannot exceed 100 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (params.firstName !== undefined && params.firstName.length > 50) {
      throw new OAuth2Error(
        '名字不能超过50个字符 (First name cannot exceed 50 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (params.lastName !== undefined && params.lastName.length > 50) {
      throw new OAuth2Error(
        '姓氏不能超过50个字符 (Last name cannot exceed 50 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (params.organization !== undefined && params.organization.length > 100) {
      throw new OAuth2Error(
        '组织名称不能超过100个字符 (Organization name cannot exceed 100 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (params.department !== undefined && params.department.length > 100) {
      throw new OAuth2Error(
        '部门名称不能超过100个字符 (Department name cannot exceed 100 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }
  }

  /**
   * 验证密码强度
   * Validate password strength
   *
   * @param password - 密码 (Password)
   */
  private static validatePassword(password: string): void {
    if (!password || password.length < 8) {
      throw new OAuth2Error(
        '密码至少需要8个字符 (Password must be at least 8 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    if (password.length > 128) {
      throw new OAuth2Error(
        '密码不能超过128个字符 (Password cannot exceed 128 characters)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }

    // 密码强度要求：至少包含一个数字和一个字母
    // Password strength requirement: at least one number and one letter
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      throw new OAuth2Error(
        '密码必须包含至少一个字母和一个数字 (Password must contain at least one letter and one number)',
        OAuth2ErrorCode.InvalidRequest,
        400
      );
    }
  }
}
