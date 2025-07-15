/**
 * 创建管理员用户脚本
 * 用于初始化系统管理员账户
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    // 检查是否已存在管理员用户
    const existingUser = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (existingUser) {
      console.log('✅ 管理员用户已存在，跳过创建');
      return existingUser;
    }

    // 创建密码哈希
    const passwordHash = await bcrypt.hash('admin123', 12);

    // 创建管理员用户
    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        displayName: '系统管理员',
        firstName: '系统',
        lastName: '管理员',
        organization: '企业内部系统',
        department: 'IT运维',
        isActive: true,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        createdBy: 'system',
      }
    });

    console.log('✅ 成功创建管理员用户');
    console.log('用户名: admin');
    console.log('密码: admin123');
    console.log('用户ID:', adminUser.id);

    // 创建管理员角色（如果不存在）
    const adminRole = await prisma.role.upsert({
      where: { name: 'administrator' },
      update: {},
      create: {
        name: 'administrator',
        displayName: '系统管理员',
        description: '拥有系统所有权限的管理员角色',
        isSystemRole: true,
      }
    });

    // 分配管理员角色给用户
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
        assignedBy: 'system'
      }
    });

    console.log('✅ 已为管理员用户分配系统管理员角色');

    return adminUser;

  } catch (error) {
    console.error('❌ 创建管理员用户失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  createAdminUser()
    .then(() => console.log('管理员用户创建完成'))
    .catch(console.error);
}

module.exports = { createAdminUser };