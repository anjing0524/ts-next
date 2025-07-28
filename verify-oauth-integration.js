// OAuth集成验证脚本
// 运行：node verify-oauth-integration.js

const https = require('https');
const http = require('http');

// 配置
const OAUTH_SERVICE_URL = 'http://localhost:3001';
const ADMIN_PORTAL_URL = 'http://localhost:3002';
const CLIENT_ID = 'admin-portal-client';
const REDIRECT_URI = 'http://localhost:3002/auth/callback';

// 测试函数
async function testOAuthIntegration() {
  console.log('🔍 开始验证OAuth 2.1集成...\n');

  try {
    // 1. 验证OAuth服务健康状态
    console.log('1. 检查OAuth服务健康状态...');
    const healthResponse = await fetch(`${OAUTH_SERVICE_URL}/api/v2/health`);
    const healthData = await healthResponse.json();
    console.log(`   ✅ OAuth服务运行正常: ${healthData.status}\n`);

    // 2. 验证客户端注册
    console.log('2. 检查admin-portal客户端注册...');
    const clientResponse = await fetch(`${OAUTH_SERVICE_URL}/api/v2/clients/${CLIENT_ID}`);
    if (clientResponse.ok) {
      const clientData = await clientResponse.json();
      console.log(`   ✅ 客户端已注册: ${clientData.name}\n`);
      console.log(`   📋 客户端配置:`);
      console.log(`      - 名称: ${clientData.name}`);
      console.log(`      - 重定向URI: ${clientData.redirectUris}`);
      console.log(`      - 类型: ${clientData.clientType}\n`);
    } else {
      console.log(`   ❌ 客户端未注册: ${CLIENT_ID}\n`);
    }

    // 3. 验证授权端点
    console.log('3. 验证授权端点可访问性...');
    const authResponse = await fetch(`${OAUTH_SERVICE_URL}/api/v2/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid`, {
      method: 'GET',
      redirect: 'manual' // 不跟随重定向
    });
    
    if (authResponse.status === 302 || authResponse.status === 303) {
      console.log(`   ✅ 授权端点正常响应: ${authResponse.status} 重定向\n`);
      const location = authResponse.headers.get('location');
      console.log(`   📍 重定向到: ${location}\n`);
    } else {
      console.log(`   ⚠️  授权端点响应: ${authResponse.status}\n`);
    }

    // 4. 验证JWKS端点
    console.log('4. 验证JWKS端点...');
    const jwksResponse = await fetch(`${OAUTH_SERVICE_URL}/api/v2/oauth/jwks`);
    const jwksData = await jwksResponse.json();
    if (jwksData.keys && jwksData.keys.length > 0) {
      console.log(`   ✅ JWKS端点正常: ${jwksData.keys.length}个密钥\n`);
    } else {
      console.log(`   ❌ JWKS端点异常\n`);
    }

    // 5. 验证admin-portal登录页面
    console.log('5. 验证admin-portal登录页面...');
    const loginResponse = await fetch(`${ADMIN_PORTAL_URL}/login`);
    if (loginResponse.ok) {
      console.log(`   ✅ Admin Portal登录页面正常\n`);
    } else {
      console.log(`   ❌ Admin Portal登录页面异常: ${loginResponse.status}\n`);
    }

    console.log('🎉 OAuth集成验证完成！');
    console.log('📋 下一步测试:');
    console.log('   1. 在浏览器中访问 http://localhost:3002/login');
    console.log('   2. 点击"开始登录"按钮');
    console.log('   3. 验证OAuth流程完整性');

  } catch (error) {
    console.error('❌ 验证失败:', error.message);
  }
}

// 运行验证
if (require.main === module) {
  testOAuthIntegration();
}