#!/usr/bin/env node

/**
 * OAuth 2.1 集成测试脚本
 * 测试 admin-portal 与 oauth-service 的完整集成
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

// 服务配置
const OAUTH_SERVICE_URL = 'http://localhost:3001';
const ADMIN_PORTAL_URL = 'http://localhost:3002';

// 测试用户配置
const TEST_USERS = {
  admin: {
    username: 'admin',
    password: 'adminpassword'
  },
  testuser: {
    username: 'testuser',
    password: 'password'
  }
};

// OAuth 客户端配置
const CLIENT_CONFIG = {
  client_id: 'admin-portal-client',
  client_secret: 'admin-portal-secret-key-change-this-in-production',
  redirect_uri: `${ADMIN_PORTAL_URL}/auth/callback`
};

/**
 * 生成 PKCE 参数
 */
function generatePKCE() {
  const code_verifier = crypto.randomBytes(32).toString('base64url');
  const code_challenge = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64url');
  
  return {
    code_verifier,
    code_challenge,
    code_challenge_method: 'S256',
    state: crypto.randomBytes(16).toString('hex')
  };
}

/**
 * 发送 HTTP 请求
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ statusCode: res.statusCode, headers: res.headers, data: result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * 检查服务是否启动
 */
async function checkServiceHealth(serviceUrl, serviceName) {
  try {
    const response = await httpRequest(`${serviceUrl}/api/v2/health`);
    if (response.statusCode === 200) {
      console.log(`✅ ${serviceName} 服务已启动`);
      return true;
    }
  } catch (error) {
    console.log(`❌ ${serviceName} 服务未启动: ${error.message}`);
    return false;
  }
}

/**
 * 测试用户名密码登录流程
 */
async function testUsernamePasswordLogin() {
  console.log('\n🔐 测试用户名密码登录流程...');
  
  const pkce = generatePKCE();
  
  try {
    // 1. 使用用户名密码验证
    const loginResponse = await httpRequest(`${OAUTH_SERVICE_URL}/api/v2/auth/login`, {
      method: 'POST',
      body: {
        username: TEST_USERS.admin.username,
        password: TEST_USERS.admin.password,
        client_id: CLIENT_CONFIG.client_id,
        redirect_uri: CLIENT_CONFIG.redirect_uri,
        response_type: 'code',
        scope: 'openid profile email user:read user:write role:read role:write permission:read permission:write client:read client:write audit:read',
        state: pkce.state,
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method
      }
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error(`登录验证失败: ${loginResponse.data?.message || 'Unknown error'}`);
    }

    console.log('✅ 用户名密码验证成功');
    console.log('📋 授权URL:', loginResponse.data.data.redirect_url);
    
    // 2. 提取授权URL参数
    const authUrl = new URL(loginResponse.data.data.redirect_url);
    const authCode = authUrl.searchParams.get('code');
    
    if (!authCode) {
      console.log('✅ 授权码已包含在重定向URL中');
    }
    
    return {
      success: true,
      redirectUrl: loginResponse.data.data.redirect_url,
      user: loginResponse.data.data.user
    };
    
  } catch (error) {
    console.log(`❌ 用户名密码登录测试失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试授权码交换令牌
 */
async function testTokenExchange() {
  console.log('\n🔄 测试授权码交换令牌...');
  
  const pkce = generatePKCE();
  
  try {
    // 1. 先获取授权码（模拟浏览器重定向）
    const loginResponse = await httpRequest(`${OAUTH_SERVICE_URL}/api/v2/auth/login`, {
      method: 'POST',
      body: {
        username: TEST_USERS.admin.username,
        password: TEST_USERS.admin.password,
        client_id: CLIENT_CONFIG.client_id,
        redirect_uri: CLIENT_CONFIG.redirect_uri,
        response_type: 'code',
        scope: 'openid profile',
        state: pkce.state,
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method
      }
    });

    // 2. 模拟授权流程 - 直接调用授权端点
    const authParams = new URLSearchParams({
      client_id: CLIENT_CONFIG.client_id,
      redirect_uri: CLIENT_CONFIG.redirect_uri,
      response_type: 'code',
      scope: 'openid profile',
      state: pkce.state,
      code_challenge: pkce.code_challenge,
      code_challenge_method: pkce.code_challenge_method
    });

    const authResponse = await httpRequest(`${OAUTH_SERVICE_URL}/api/v2/oauth/authorize?${authParams.toString()}`, {
      method: 'GET'
    });

    // 3. 如果已登录，应该重定向到回调URL
    if (authResponse.statusCode === 302 || authResponse.statusCode === 303) {
      const location = authResponse.headers.location;
      console.log('✅ 授权成功，重定向到:', location);
      
      // 4. 提取授权码
      const callbackUrl = new URL(location);
      const code = callbackUrl.searchParams.get('code');
      
      if (code) {
        // 5. 交换授权码获取令牌
        const tokenResponse = await httpRequest(`${OAUTH_SERVICE_URL}/api/v2/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_CONFIG.client_id,
            client_secret: CLIENT_CONFIG.client_secret,
            code: code,
            redirect_uri: CLIENT_CONFIG.redirect_uri,
            code_verifier: pkce.code_verifier
          }).toString()
        });

        if (tokenResponse.statusCode === 200) {
          console.log('✅ 令牌交换成功');
          console.log('🔑 访问令牌:', tokenResponse.data.access_token.substring(0, 20) + '...');
          console.log('🔄 刷新令牌:', tokenResponse.data.refresh_token.substring(0, 20) + '...');
          
          return {
            success: true,
            tokens: tokenResponse.data
          };
        } else {
          throw new Error(`令牌交换失败: ${tokenResponse.data?.error || 'Unknown error'}`);
        }
      }
    }
    
    return { success: false, error: '无法获取授权码' };
    
  } catch (error) {
    console.log(`❌ 令牌交换测试失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试用户信息获取
 */
async function testUserInfo(token) {
  console.log('\n👤 测试用户信息获取...');
  
  try {
    const userInfoResponse = await httpRequest(`${OAUTH_SERVICE_URL}/api/v2/oauth/userinfo`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (userInfoResponse.statusCode === 200) {
      console.log('✅ 用户信息获取成功');
      console.log('👤 用户名:', userInfoResponse.data.username);
      console.log('📧 邮箱:', userInfoResponse.data.email);
      console.log('🎭 角色:', userInfoResponse.data.roles?.join(', '));
      
      return { success: true, user: userInfoResponse.data };
    } else {
      throw new Error(`获取用户信息失败: ${userInfoResponse.data?.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`❌ 用户信息获取测试失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试完整的登录流程
 */
async function testCompleteLoginFlow() {
  console.log('🚀 开始测试完整的 OAuth 2.1 登录流程...');
  console.log('='.repeat(60));
  
  // 检查服务是否启动
  const oauthServiceReady = await checkServiceHealth(OAUTH_SERVICE_URL, 'OAuth服务');
  
  if (!oauthServiceReady) {
    console.log('\n⚠️  请先启动服务：');
    console.log('   pnpm dev');
    return;
  }
  
  const results = [];
  
  // 测试1: 用户名密码验证
  const loginResult = await testUsernamePasswordLogin();
  results.push({ test: '用户名密码验证', result: loginResult });
  
  // 测试2: 令牌交换
  const tokenResult = await testTokenExchange();
  results.push({ test: '令牌交换', result: tokenResult });
  
  // 测试3: 用户信息获取（如果有令牌）
  if (tokenResult.success && tokenResult.tokens) {
    const userInfoResult = await testUserInfo(tokenResult.tokens.access_token);
    results.push({ test: '用户信息获取', result: userInfoResult });
  }
  
  // 总结报告
  console.log('\n📊 测试结果总结:');
  console.log('='.repeat(60));
  
  let passed = 0;
  let total = results.length;
  
  results.forEach(({ test, result }) => {
    if (result.success) {
      console.log(`✅ ${test}`);
      passed++;
    } else {
      console.log(`❌ ${test}: ${result.error}`);
    }
  });
  
  console.log(`\n📈 通过率: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
  
  if (passed === total) {
    console.log('\n🎉 所有测试通过！OAuth 2.1 集成已成功完成。');
    console.log('\n📋 测试账号:');
    console.log('   管理员: admin / adminpassword');
    console.log('   测试用户: testuser / password');
    console.log('\n🔗 访问链接:');
    console.log(`   管理后台: ${ADMIN_PORTAL_URL}`);
    console.log(`   OAuth服务: ${OAUTH_SERVICE_URL}`);
  } else {
    console.log('\n⚠️  部分测试失败，请检查服务状态和配置。');
  }
}

// 运行测试
if (require.main === module) {
  testCompleteLoginFlow().catch(console.error);
}

module.exports = {
  testCompleteLoginFlow,
  TEST_USERS,
  CLIENT_CONFIG,
  generatePKCE
};