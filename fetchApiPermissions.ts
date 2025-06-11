// fetchApiPermissions.ts
// 该脚本用于从数据库中查询所有类型为 'API' 的权限记录。
// (This script is used to query all Permission records of type 'API' from the database.)

import { PrismaClient, PermissionType } from '@prisma/client';

// 初始化 Prisma Client 实例
// (Initialize Prisma Client instance)
const prisma = new PrismaClient();

async function main() {
  console.log('正在查询所有 API 类型的权限...');
  // (Querying all permissions of type API...)

  try {
    const apiPermissions = await prisma.permission.findMany({
      where: {
        // 根据 PermissionType 枚举筛选 'API' 类型
        // (Filter by 'API' type based on the PermissionType enum)
        type: PermissionType.API,
      },
      select: {
        id: true,         // 权限的唯一ID (Unique ID of the permission)
        name: true,       // 权限的名称/标识符 (Name/identifier of the permission, e.g., "user:create_api")
        resource: true,   // 权限关联的资源路径 (Resource path associated with the permission, e.g., "/api/users")
        description: true // (可选) 权限的描述 (Optional: Description of the permission)
      },
      orderBy: {
        resource: 'asc', // 按资源路径排序，方便查看 (Sort by resource path for easier viewing)
      }
    });

    if (apiPermissions.length === 0) {
      console.log('未找到任何 API 类型的权限。');
      // (No API type permissions found.)
    } else {
      console.log(`成功查询到 ${apiPermissions.length} 条 API 类型的权限:`);
      // (Successfully queried ${apiPermissions.length} API type permissions:)

      // 以更易读的格式打印，或者直接打印JSON
      // (Print in a more readable format, or print JSON directly)
      apiPermissions.forEach(perm => {
        console.log(
          `  ID: ${perm.id}, 名称 (Name): "${perm.name}", 资源 (Resource): "${perm.resource}", 描述 (Description): "${perm.description || 'N/A'}"`
        );
      });

      // 或者，输出为JSON字符串，方便后续脚本处理
      // (Alternatively, output as a JSON string for easy processing by subsequent scripts)
      // console.log('\nJSON output:');
      // console.log(JSON.stringify(apiPermissions, null, 2));
    }

  } catch (error) {
    console.error('查询权限时发生错误 (Error occurred while querying permissions):', error);
    process.exitCode = 1; // 设置退出码为1，表示错误 (Set exit code to 1 to indicate an error)
  } finally {
    // 关闭 Prisma Client 连接
    // (Close Prisma Client connection)
    await prisma.$disconnect();
  }
}

main();
