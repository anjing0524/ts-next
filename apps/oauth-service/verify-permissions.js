const { PrismaClient } = require('@prisma/client');

async function verifyPermissions() {
  const prisma = new PrismaClient();
  
  try {
    // 连接数据库
    await prisma.$connect();
    console.log('Connected to database');
    
    // 查询用户的权限
    const user = await prisma.user.findUnique({
      where: { username: 'admin' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });
    
    if (!user) {
      console.log('Admin user not found');
      return;
    }
    
    console.log('User found:', user.username);
    
    // 收集权限
    const permissions = new Set();
    user.userRoles.forEach(ur => {
      console.log(`Role: ${ur.role.name}`);
      ur.role.rolePermissions.forEach(rp => {
        console.log(`  - Permission: ${rp.permission.name}`);
        permissions.add(rp.permission.name);
      });
    });
    
    console.log('\nTotal permissions:', Array.from(permissions).length);
    console.log('Permissions:', Array.from(permissions));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPermissions();