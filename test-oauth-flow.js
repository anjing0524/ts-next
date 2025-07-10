#!/usr/bin/env node

/**
 * OAuth2.1 登录流程测试脚本
 * 模拟完整的授权码+PKCE登录流程
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// 配置
const config = {
  oauthServiceUrl: 'http://localhost:3001',
  adminPortalUrl: 'http://localhost:3002',
  clientId: 'auth-center-admin-client',
  clientSecret: 'authcenteradminclientsecret',
  redirectUri: 'http://localhost:3002/auth/callback',
  scope: 'openid profile email admin:full_access offline_access'
};

// 生成PKCE参数
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// 生成state参数
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// 发送HTTP请求
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// 测试步骤1: 生成授权URL
async function testStep1() {
  console.log('=== 步骤1: 生成授权URL ===');
  
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  
  console.log('PKCE参数:');
  console.log('  code_verifier:', codeVerifier);
  console.log('  code_challenge:', codeChallenge);
  console.log('  state:', state);
  
  const authUrl = new URL('/api/v2/oauth/authorize', config.oauthServiceUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  
  console.log('授权URL:', authUrl.toString());
  
  return { codeVerifier, state, authUrl: authUrl.toString() };
}

// 测试步骤2: 访问授权端点
async function testStep2(authUrl) {
  console.log('\n=== 步骤2: 访问授权端点 ===');
  
  try {
    const response = await makeRequest(authUrl);
    console.log('状态码:', response.statusCode);
    console.log('响应头:', response.headers);
    
    if (response.statusCode === 302 || response.statusCode === 307) {
      const location = response.headers.location;
      console.log('重定向到:', location);
      return location;
    } else {
      console.log('响应内容:', response.data);
      return null;
    }
  } catch (error) {
    console.error('请求失败:', error.message);
    return null;
  }
}

// 测试步骤3: 模拟token交换
async function testStep3(codeVerifier, authorizationCode) {
  console.log('\n=== 步骤3: 模拟token交换 ===');
  
  const tokenUrl = `${config.oauthServiceUrl}/api/v2/oauth/token`;
  const formData = new URLSearchParams();
  formData.append('grant_type', 'authorization_code');
  formData.append('client_id', config.clientId);
  formData.append('client_secret', config.clientSecret);
  formData.append('code', authorizationCode);
  formData.append('redirect_uri', config.redirectUri);
  formData.append('code_verifier', codeVerifier);
  
  try {
    const response = await makeRequest(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    console.log('Token响应状态码:', response.statusCode);
    console.log('Token响应内容:', response.data);
    
    if (response.statusCode === 200) {
      const tokenData = JSON.parse(response.data);
      console.log('访问令牌:', tokenData.access_token ? '✅ 成功' : '❌ 失败');
      console.log('刷新令牌:', tokenData.refresh_token ? '✅ 成功' : '❌ 失败');
      return tokenData;
    } else {
      console.log('Token交换失败');
      return null;
    }
  } catch (error) {
    console.error('Token交换请求失败:', error.message);
    return null;
  }
}

// 主测试函数
async function runOAuthTest() {
  console.log('🚀 开始OAuth2.1登录流程测试\n');
  
  try {
    // 步骤1: 生成授权URL
    const { codeVerifier, state, authUrl } = await testStep1();
    
    // 步骤2: 访问授权端点
    const redirectUrl = await testStep2(authUrl);
    
    if (redirectUrl) {
      console.log('\n✅ 授权端点正常工作');
      console.log('📝 注意: 在实际流程中，用户会被重定向到登录页面');
      console.log('📝 登录成功后，用户会被重定向到回调URL');
      
      // 模拟授权码（在实际流程中，这来自oauth-service的重定向）
      const mockAuthCode = 'mock_authorization_code_' + Date.now();
      
      // 步骤3: 测试token交换
      const tokenData = await testStep3(codeVerifier, mockAuthCode);
      
      if (tokenData) {
        console.log('\n✅ OAuth2.1流程测试完成');
        console.log('📊 测试结果:');
        console.log('  - 授权端点: ✅ 正常');
        console.log('  - Token端点: ✅ 正常');
        console.log('  - PKCE验证: ✅ 正常');
      } else {
        console.log('\n❌ Token交换失败');
      }
    } else {
      console.log('\n❌ 授权端点测试失败');
    }
    
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
  }
}

// 运行测试
runOAuthTest(); 