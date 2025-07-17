/**
 * 管理员门户客户端配置脚本
 * 用于创建admin-portal作为OAuth2.1第三方客户端的配置
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupAdminPortalClient() {
  try {
    // 检查是否已存在admin-portal客户端
    const existingClient = await prisma.oAuthClient.findUnique({
      where: { clientId: 'admin-portal-client' },
    });

    if (existingClient) {
      console.log('✅ admin-portal-client 已存在，跳过创建');
      return;
    }

    // 创建admin-portal OAuth客户端
    const adminPortalClient = await prisma.oAuthClient.create({
      data: {
        clientId: 'admin-portal-client',
        clientSecret: 'admin-portal-secret-key-change-this-in-production',
        name: '管理员门户',
        description: '企业统一认证管理后台，用于用户和权限管理',
        clientType: 'CONFIDENTIAL',
        redirectUris: JSON.stringify([
          'http://localhost:3001/auth/callback',
          'https://your-domain.com/auth/callback',
        ]),
        grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
        responseTypes: JSON.stringify(['code']),
        allowedScopes: JSON.stringify([
          'openid',
          'profile',
          'email',
          'user:read',
          'user:write',
          'role:read',
          'role:write',
          'permission:read',
          'permission:write',
          'client:read',
          'client:write',
          'audit:read',
        ]),
        requirePkce: true,
        requireConsent: false, // 管理员门户不需要用户同意
        tokenEndpointAuthMethod: 'client_secret_basic',
        accessTokenTtl: 3600, // 1小时
        refreshTokenTtl: 86400, // 24小时
        isActive: true,
      },
    });

    console.log('✅ 成功创建admin-portal-client');
    console.log('客户端ID:', adminPortalClient.clientId);
    console.log('客户端密钥: admin-portal-secret-key-change-this-in-production');
  } catch (error) {
    console.error('❌ 创建admin-portal-client失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  setupAdminPortalClient()
    .then(() => console.log('配置完成'))
    .catch(console.error);
}

module.exports = { setupAdminPortalClient };
