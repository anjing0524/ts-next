/**
 * OAuth2.1授权端点测试套件
 * 测试 /api/v2/oauth/authorize 端点的完整功能
 * 
 * 测试覆盖：
 * - OAuth2.1授权码流程
 * - PKCE强制验证 (S256)
 * - 客户端认证与授权
 * - 用户认证流程
 * - 错误处理与安全性
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v2/oauth/authorize/route';
import { prisma } from '@/lib/prisma';
import { PKCEUtils } from '@/lib/auth/oauth2';
import { generateTestJWT, createTestOAuthClient, createTestUser, clearTestData } from '../../../setup/test-helpers';

// 模拟依赖
jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

describe('OAuth2.1 授权端点 (/api/v2/oauth/authorize)', () => {
  // 测试数据
  let testClient: any;
  let testUser: any;
  let validPKCEParams: { codeVerifier: string; codeChallenge: string };

  beforeAll(async () => {
    // 生成测试用的PKCE参数
    validPKCEParams = {
      codeVerifier: PKCEUtils.generateCodeVerifier(),
      codeChallenge: PKCEUtils.generateCodeChallenge(PKCEUtils.generateCodeVerifier()),
    };
  });

  beforeEach(async () => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 创建测试客户端
    testClient = createTestOAuthClient({
      clientId: 'test_client_001',
      redirectUris: ['http://localhost:3000/callback', 'http://example.com/callback'],
      requirePkce: true,
      isActive: true,
    });

    // 创建测试用户
    testUser = createTestUser({
      id: 'test_user_001',
      email: 'test@example.com',
      isActive: true,
    });

    // 模拟数据库查询
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(testClient);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('✅ 成功授权流程', () => {
    test('应该成功启动OAuth2.1授权流程 (有效PKCE + 已认证用户)', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid profile');
      url.searchParams.set('state', 'test_state_123');
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      // 模拟已认证用户的session token
      request.cookies.set('auth_center_session_token', await generateTestJWT({
        sub: testUser.id,
        aud: 'urn:auth-center:ui',
        scope: 'auth-center-session',
      }));

      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      
      // 应该重定向到同意页面或直接返回授权码
      expect(location).toMatch(/\/consent|\/callback.*code=/);
      
      // 验证数据库调用
      expect(prisma.oAuthClient.findUnique).toHaveBeenCalledWith({
        where: { clientId: testClient.clientId }
      });
    });

    test('应该为未认证用户重定向到登录页面', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      // 不设置session token，模拟未认证用户

      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('/login');
    });
  });

  describe('❌ 参数验证测试', () => {
    test('应该拒绝缺少必需参数的请求', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/authorize');
      
      const response = await GET(request);
      
      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_request');
      expect(errorData.success).toBe(false);
    });

    test('应该拒绝无效的response_type', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'token'); // 不支持的类型
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=unsupported_response_type');
    });

    test('应该拒绝不匹配的redirect_uri', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', 'http://evil.com/callback'); // 恶意重定向
      url.searchParams.set('scope', 'openid');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_request');
      expect(errorData.error.message).toContain('redirect_uri');
    });
  });

  describe('🔒 PKCE安全验证', () => {
    test('应该强制要求PKCE参数', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      // 故意不提供PKCE参数

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=invalid_request');
      expect(location).toContain('PKCE');
    });

    test('应该只接受S256方法', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge', 'test_challenge');
      url.searchParams.set('code_challenge_method', 'plain'); // 不安全的方法

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=invalid_request');
      expect(location).toContain('S256');
    });

    test('应该验证code_challenge格式', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge', 'invalid_challenge!@#'); // 无效格式
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=invalid_request');
      expect(location).toContain('code_challenge');
    });
  });

  describe('🏢 客户端验证', () => {
    test('应该拒绝无效的客户端ID', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', 'invalid_client');
      url.searchParams.set('redirect_uri', 'http://example.com/callback');
      url.searchParams.set('scope', 'openid');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_client');
    });

    test('应该拒绝非活跃的客户端', async () => {
      const inactiveClient = { ...testClient, isActive: false };
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(inactiveClient);

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_client');
    });
  });

  describe('🔐 用户认证测试', () => {
    test('应该验证JWT session token格式', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      request.cookies.set('auth_center_session_token', 'invalid_jwt_token');

      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('/login'); // 应该重定向到登录
    });

    test('应该处理过期的session token', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      // 生成已过期的JWT
      request.cookies.set('auth_center_session_token', await generateTestJWT({
        sub: testUser.id,
        aud: 'urn:auth-center:ui',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1小时前过期
      }));

      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('/login');
    });
  });

  describe('📦 Scope验证', () => {
    test('应该验证请求的scope', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'invalid_scope'); // 无效的scope
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=invalid_scope');
    });

    test('应该要求提供scope参数', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      // 故意不提供scope参数
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toContain('error=invalid_scope');
      expect(location).toContain('required');
    });
  });

  describe('🔄 State参数处理', () => {
    test('应该正确传递state参数', async () => {
      const testState = 'secure_state_123';
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('state', testState);
      url.searchParams.set('code_challenge', validPKCEParams.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      
      if (location) {
        const redirectUrl = new URL(location);
        expect(redirectUrl.searchParams.get('state')).toBe(testState);
      }
    });
  });

  describe('⚡ 错误处理', () => {
    test('应该在数据库错误时返回服务器错误', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', testClient.clientId);
      url.searchParams.set('redirect_uri', testClient.redirectUris[0]);
      url.searchParams.set('scope', 'openid');

      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(500);
      const errorData = await response.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error.code).toBe('server_error');
    });

    test('应该有正确的CORS头部设置', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/authorize');
      const response = await GET(request);

      // 检查安全头部
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });
  });
});

// 性能测试
describe('🚀 性能测试', () => {
  test('应该在合理时间内响应', async () => {
    const url = new URL('http://localhost:3000/api/v2/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', 'test_client');
    url.searchParams.set('redirect_uri', 'http://example.com/callback');
    url.searchParams.set('scope', 'openid');

    const request = new NextRequest(url);
    
    const startTime = Date.now();
    const response = await GET(request);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(1000); // 应该在1秒内响应
    expect(response).toBeDefined();
  }, 10000);
}); 