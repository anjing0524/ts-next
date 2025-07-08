// packages/lib/src/services/user-service.ts
import { prisma } from '@repo/database';
import { excludePassword } from '../utils/misc';

/**
 * 根据用户ID获取用户详细信息，包括其角色和权限。
 * @param userId - 用户的唯一标识符。
 * @returns 返回用户的详细信息对象（不含密码哈希），如果未找到则返回 null。
 */
export async function getUserDetails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: { // Correct relation name
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

  // 提取并扁平化权限列表
  const permissions = user.userRoles.flatMap(userRole =>
    userRole.role.rolePermissions.map(rolePermission => rolePermission.permission.name)
  );

  // 创建一个不包含密码哈希和详细角色信息的干净用户对象
  const userWithoutPassword = excludePassword(user);

  return {
    ...userWithoutPassword,
    // 挂载一个扁平化的权限名称数组，方便前端使用
    permissions: [...new Set(permissions)], // 使用 Set 去重
  };
}
