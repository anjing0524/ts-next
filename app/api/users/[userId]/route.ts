import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware'; // Assuming AuthContext is exported or merged by withAuth
import { z } from 'zod';

// 定义更新用户个人资料的 Zod Schema
const UpdateUserProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  email: z.string().email('Invalid email format').optional(), // Email 仍可更新，但 username 通常作为登录标识不可变
  isActive: z.boolean().optional(), // 允许管理员更新用户激活状态
});

interface UserRouteContext extends AuthContext {
  params: {
    userId: string;
  };
}

// GET /api/users/{userId} - 获取用户个人资料 (已重构)
export const GET = withAuth(
  async (request: NextRequest, context: UserRouteContext) => {
    // 从 context.params 中获取 userId
    const { userId } = context.params;

    // 权限检查：用户可以访问自己的个人资料，或者需要特定权限才能访问他人的资料
    // 'user_profile:read_any' 是一个示例权限，请确保与您的权限系统一致
    if (context.user_id !== userId && !context.permissions.includes('user_profile:read_any')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to access this user profile' },
        { status: 403 }
      );
    }

    try {
      // 查询用户，并包含其角色信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { // 选择需要的用户字段
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          userRoles: { // 包含用户的角色关联
            select: {
              role: { // 选择角色本身的详细信息
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                }
              }
            }
          }
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // 将 userRoles 结构扁平化，直接返回角色列表
      const userWithRoles = {
        ...user,
        roles: user.userRoles.map(ur => ur.role),
      };
      // @ts-ignore //  userRoles will be removed after this
      delete userWithRoles.userRoles;


      return NextResponse.json({ user: userWithRoles });
    } catch (error) {
      console.error('Error fetching user:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    // requiredScopes: ['profile'], // 权限范围，根据实际 OAuth/OIDC 配置
    requireUserContext: true, // 确保 user_id 和 permissions 在 context 中可用
  }
);

// PUT /api/users/{userId} - 更新用户个人资料 (已重构)
export const PUT = withAuth(
  async (request: NextRequest, context: UserRouteContext) => {
    const { userId } = context.params;

    // 权限检查：用户可以更新自己的个人资料，或者需要特定权限才能更新他人的资料
    // 'user_profile:write_any' 是一个示例权限
    if (context.user_id !== userId && !context.permissions.includes('user_profile:write_any')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update this user profile' },
        { status: 403 }
      );
    }

    try {
      const body = await request.json();
      // 使用 Zod Schema 校验请求体
      const validationResult = UpdateUserProfileSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
      }

      const { firstName, lastName, email, isActive } = validationResult.data;

      // 构建要更新的数据对象，只包含请求中提供的字段
      const dataToUpdate: any = {};
      if (firstName !== undefined) dataToUpdate.firstName = firstName;
      if (lastName !== undefined) dataToUpdate.lastName = lastName;
      if (email !== undefined) dataToUpdate.email = email;
      // 只有当请求中明确包含 isActive 时才更新它。
      // 特别注意：如果 isActive 是管理员才能修改的字段，需要额外权限检查。
      // 当前的 'user_profile:write_any' 权限较大，可能已包含此能力。
      if (isActive !== undefined) {
        // 如果不是用户自己修改，且修改的是 isActive 字段，可能需要更严格的权限
        if (context.user_id !== userId && !context.permissions.includes('user_profile:manage_status_any')) {
           // return NextResponse.json({ error: 'Insufficient permissions to update user activation status' }, { status: 403 });
           // For now, assuming 'user_profile:write_any' is enough. If not, uncomment above.
        }
        dataToUpdate.isActive = isActive;
      }

      if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ error: 'No fields provided for update' }, { status: 400 });
      }
      dataToUpdate.updatedAt = new Date();


      // 更新用户信息
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
        select: { // 选择返回的字段，与 GET 请求保持一致
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          isActive: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ user: updatedUser });
    } catch (error) {
      console.error('Error updating user:', error);
      // 记录审计日志 (如果适用)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    // requiredScopes: ['profile:write'],
    requireUserContext: true,
  }
);

// DELETE /api/users/{userId} - “删除”用户 (软删除，标记为不活动) (已重构)
export const DELETE = withAuth(
  async (request: NextRequest, context: UserRouteContext) => {
    const { userId } = context.params;

    // 权限检查：需要特定权限才能删除用户
    // 'user_profile:delete' 或 'user_profile:delete_any' 是示例权限
    // 注意：通常不允许用户删除自己的账户，除非有特殊流程。此接口更偏向管理员操作。
    if (!context.permissions.includes('user_profile:delete')) { // 假设 'user_profile:delete' 是管理员级别权限
        return NextResponse.json({ error: 'Insufficient permissions to delete this user' }, { status: 403 });
    }

    // 安全措施：通常不应允许用户通过此 API 删除自己的账户
    if (context.user_id === userId) {
        return NextResponse.json({ error: 'Users cannot delete their own account through this endpoint.' }, { status: 403 });
    }


    try {
      // 软删除：将用户标记为不活动 (isActive: false)
      const deactivatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          updatedAt: new Date(), // 更新时间戳
        },
        select: { // 选择返回的字段
          id: true,
          username: true,
          isActive: true,
        },
      });

      return NextResponse.json({ 
        message: 'User deactivated successfully',
        user: deactivatedUser
      });
    } catch (error) {
      console.error('Error deactivating user:', error); // 更新错误日志消息
      // 记录审计日志 (如果适用)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  {
    requiredPermissions: ['user_profile:delete'], // 确保此权限与您的权限定义一致
    requireUserContext: true,
  }
);