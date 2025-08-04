/**
 * JWT 权限验证测试
 * 用于验证 JWT 令牌是否正确包含权限信息
 */

import { JWTUtils } from '@repo/lib/node';
import { prisma } from '@repo/database';

async function testJwtPermissions() {
  console.log('Testing JWT permissions...');
  
  try {
    // 获取测试用户
    const user = await prisma.user.findFirst({
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
      console.error('Test user not found');
      return;
    }
    
    // 收集权限
    const permissions = new Set<string>();
    user.userRoles.forEach(ur => {
      ur.role.rolePermissions.forEach(rp => {
        permissions.add(rp.permission.name);
      });
    });
    
    const permissionArray = Array.from(permissions);
    console.log('User permissions:', permissionArray);
    
    // 生成 JWT
    const token = await JWTUtils.generateToken({
      sub: user.id,
      client_id: 'test-client',
      user_id: user.id,
      scope: 'openid profile',
      permissions: permissionArray
    }, {
      expiresIn: '1h'
    });
    
    console.log('Generated token length:', token.length);
    
    // 验证令牌
    const result = await JWTUtils.verifyToken(token);
    if (result.valid && result.payload) {
      console.log('Token verified successfully');
      console.log('Permissions in token:', result.payload.permissions);
      
      // 验证权限是否匹配
      const tokenPermissions = result.payload.permissions as string[] || [];
      const allPermissionsMatch = permissionArray.every(p => tokenPermissions.includes(p));
      
      if (allPermissionsMatch) {
        console.log('✅ All permissions are correctly included in the JWT');
      } else {
        console.error('❌ Some permissions are missing from the JWT');
        console.error('Expected:', permissionArray);
        console.error('Found in token:', tokenPermissions);
      }
    } else {
      console.error('❌ Token verification failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// 运行测试
testJwtPermissions().then(() => {
  console.log('JWT permissions test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});