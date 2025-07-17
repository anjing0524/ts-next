/**
 * OAuth2.1系统初始化脚本
 * 用于设置完整的OAuth2.1认证授权系统
 */

const { PrismaClient } = require('@prisma/client');
const { setupAdminPortalClient } = require('./setup-admin-portal-client');
const { createAdminUser } = require('./create-admin-user');

const prisma = new PrismaClient();

async function setupOAuthSystem() {
  console.log('🚀 开始初始化OAuth2.1系统...\n');

  try {
    // 1. 创建管理员用户
    console.log('📋 步骤1: 创建管理员用户...');
    await createAdminUser();
    console.log('');

    // 2. 创建admin-portal客户端
    console.log('📋 步骤2: 创建admin-portal OAuth客户端...');
    await setupAdminPortalClient();
    console.log('');

    // 3. 创建必要的权限和角色
    console.log('📋 步骤3: 创建系统权限和角色...');
    await setupPermissionsAndRoles();
    console.log('');

    // 4. 验证配置
    console.log('📋 步骤4: 验证系统配置...');
    await validateSystemSetup();
    console.log('');

    console.log('✅ OAuth2.1系统初始化完成！');
    console.log('\n🎯 使用说明:');
    console.log('   管理员登录: http://localhost:3001/login');
    console.log('   用户名: admin');
    console.log('   密码: admin123');
    console.log('   OAuth服务: http://localhost:3002');
    console.log('\n📖 下一步操作:');
    console.log('   1. 启动oauth-service: pnpm dev:oauth');
    console.log('   2. 启动admin-portal: pnpm dev:admin');
    console.log('   3. 访问管理后台开始测试');
  } catch (error) {
    console.error('❌ 系统初始化失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function setupPermissionsAndRoles() {
  try {
    // 创建管理员权限
    const adminPermissions = [
      { name: 'user:read', displayName: '查看用户', description: '查看用户列表和详情' },
      { name: 'user:write', displayName: '管理用户', description: '创建、更新、删除用户' },
      { name: 'role:read', displayName: '查看角色', description: '查看角色列表和详情' },
      { name: 'role:write', displayName: '管理角色', description: '创建、更新、删除角色' },
      { name: 'permission:read', displayName: '查看权限', description: '查看权限列表和详情' },
      { name: 'permission:write', displayName: '管理权限', description: '创建、更新、删除权限' },
      { name: 'client:read', displayName: '查看客户端', description: '查看OAuth客户端列表' },
      {
        name: 'client:write',
        displayName: '管理客户端',
        description: '创建、更新、删除OAuth客户端',
      },
      { name: 'audit:read', displayName: '查看审计日志', description: '查看系统审计日志' },
    ];

    for (const perm of adminPermissions) {
      await prisma.permission.upsert({
        where: { name: perm.name },
        update: {},
        create: {
          name: perm.name,
          displayName: perm.displayName,
          description: perm.description,
          resource: perm.name.split(':')[0],
          action: perm.name.split(':')[1],
          type: 'API',
          isSystemPerm: true,
        },
      });
    }

    // 获取管理员角色
    const adminRole = await prisma.role.findUnique({
      where: { name: 'administrator' },
    });

    if (adminRole) {
      // 为管理员角色分配所有权限
      for (const perm of adminPermissions) {
        const permission = await prisma.permission.findUnique({
          where: { name: perm.name },
        });

        if (permission) {
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: adminRole.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: adminRole.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }

    console.log('✅ 权限和角色配置完成');
  } catch (error) {
    console.error('❌ 创建权限和角色失败:', error);
    throw error;
  }
}

async function validateSystemSetup() {
  try {
    // 验证管理员用户
    const adminUser = await prisma.user.findUnique({
      where: { username: 'admin' },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!adminUser) {
      throw new Error('管理员用户不存在');
    }

    // 验证admin-portal客户端
    const adminClient = await prisma.oAuthClient.findUnique({
      where: { clientId: 'admin-portal-client' },
    });

    if (!adminClient) {
      throw new Error('admin-portal客户端不存在');
    }

    // 验证权限
    const permissions = await prisma.permission.findMany();
    if (permissions.length === 0) {
      throw new Error('系统权限未创建');
    }

    console.log('✅ 系统验证通过');
    console.log(`   - 管理员用户: ${adminUser.username}`);
    console.log(`   - 客户端: ${adminClient.name} (${adminClient.clientId})`);
    console.log(`   - 权限数量: ${permissions.length}`);
  } catch (error) {
    console.error('❌ 系统验证失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupOAuthSystem()
    .then(() => {
      console.log('\n🎉 所有步骤完成！');
    })
    .catch(console.error);
}

module.exports = { setupOAuthSystem };
