import { PrismaClient } from '@repo/database';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting E2E test data seeding...');

  // 创建测试角色
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: '管理员角色，拥有所有权限',
      isActive: true,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      description: '普通用户角色',
      isActive: true,
    },
  });

  // 创建测试权限
  const permissions = [
    { name: 'users:read', description: '读取用户信息' },
    { name: 'users:write', description: '修改用户信息' },
    { name: 'clients:read', description: '读取客户端信息' },
    { name: 'clients:write', description: '修改客户端信息' },
    { name: 'roles:read', description: '读取角色信息' },
    { name: 'roles:write', description: '修改角色信息' },
    { name: 'permissions:read', description: '读取权限信息' },
    { name: 'permissions:write', description: '修改权限信息' },
    { name: 'audit:read', description: '读取审计日志' },
    { name: 'system:admin', description: '系统管理权限' },
  ];

  for (const permData of permissions) {
    const permission = await prisma.permission.upsert({
      where: { name: permData.name },
      update: {},
      create: {
        name: permData.name,
        description: permData.description,
        isActive: true,
      },
    });

    // 给admin角色分配所有权限
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

  // 给user角色分配基本权限
  const userPermissions = ['users:read', 'clients:read'];
  for (const permName of userPermissions) {
    const permission = await prisma.permission.findUnique({
      where: { name: permName },
    });
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: userRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: userRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // 创建测试用户
  const hashedPassword = await bcrypt.hash('Test123456!', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      displayName: '管理员',
      passwordHash: hashedPassword,
      isActive: true,
      emailVerified: true,
    },
  });

  const testUser = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {},
    create: {
      username: 'testuser',
      email: 'testuser@example.com',
      displayName: '测试用户',
      passwordHash: hashedPassword,
      isActive: true,
      emailVerified: true,
    },
  });

  // 分配角色给用户
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: testUser.id,
        roleId: userRole.id,
      },
    },
    update: {},
    create: {
      userId: testUser.id,
      roleId: userRole.id,
    },
  });

  // 创建测试OAuth客户端
  const adminPortalClient = await prisma.oAuthClient.upsert({
    where: { clientId: 'admin-portal-client' },
    update: {},
    create: {
      clientId: 'admin-portal-client',
      clientName: 'Admin Portal',
      clientSecret: 'admin-portal-secret-key',
      redirectUris: JSON.stringify([
        'http://localhost:3002/auth/callback',
        'http://localhost:3002/',
      ]),
      allowedScopes: JSON.stringify([
        'openid',
        'profile',
        'email',
        'users:read',
        'users:write',
        'clients:read',
        'clients:write',
        'roles:read',
        'roles:write',
        'permissions:read',
        'permissions:write',
        'audit:read',
      ]),
      requirePkce: true,
      clientType: 'CONFIDENTIAL',
      isActive: true,
      accessTokenTtl: 3600,
      refreshTokenTtl: 2592000,
    },
  });

  const testClient = await prisma.oAuthClient.upsert({
    where: { clientId: 'test-client' },
    update: {},
    create: {
      clientId: 'test-client',
      clientName: 'Test Client',
      clientSecret: 'test-client-secret',
      redirectUris: JSON.stringify([
        'http://localhost:3000/callback',
      ]),
      allowedScopes: JSON.stringify([
        'openid',
        'profile',
        'email',
      ]),
      requirePkce: false,
      clientType: 'PUBLIC',
      isActive: true,
      accessTokenTtl: 3600,
      refreshTokenTtl: 2592000,
    },
  });

  console.log('✅ E2E test data seeded successfully!');
  console.log('👤 Test users:');
  console.log(`   - Admin: admin / Test123456!`);
  console.log(`   - User: testuser / Test123456!`);
  console.log('🔑 Test clients:');
  console.log(`   - Admin Portal: ${adminPortalClient.clientId} / admin-portal-secret-key`);
  console.log(`   - Test Client: ${testClient.clientId} / test-client-secret`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding test data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });