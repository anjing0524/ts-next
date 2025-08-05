import { prisma } from '@repo/database';

export async function getUserProfileData(userId: string) {
  // 从数据库获取完整的用户数据，包括角色和权限
  const fullUserData = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      firstName: true,
      lastName: true,
      avatar: true,
      organization: true,
      department: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      userRoles: {
        select: {
          role: {
            select: {
              name: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!fullUserData) {
    return null;
  }

  // 提取所有权限名称
  const permissions = fullUserData.userRoles.flatMap((userRole) =>
    userRole.role.rolePermissions.map((rp) => rp.permission.name)
  );

  // 构建响应数据
  const responseData = {
    id: fullUserData.id,
    username: fullUserData.username,
    displayName: fullUserData.displayName,
    firstName: fullUserData.firstName,
    lastName: fullUserData.lastName,
    avatar: fullUserData.avatar,
    organization: fullUserData.organization,
    department: fullUserData.department,
    isActive: fullUserData.isActive,
    createdAt: fullUserData.createdAt,
    updatedAt: fullUserData.updatedAt,
    roles: fullUserData.userRoles.map((userRole) => userRole.role.name),
    permissions: Array.from(new Set(permissions)), // 去重
  };

  return responseData;
}
