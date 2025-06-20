// 文件路径: __tests__/api/v2/oauth/token/route.test.ts
// 描述: OAuth2.1令牌端点完整测试套件
// 测试重点: 授权码交换、PKCE验证、客户端认证、JWT生成(Jose库)、刷新令牌

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v2/oauth/token/route';
import { prisma } from '@/lib/prisma';
import { JWTUtils, PKCEUtils } from '@/lib/auth/oauth2';
import { 
  generateTestJWT, 
  createTestOAuthClient, 
  createTestUser, 
  createTestAuthorizationCode,
  clearTestData 
} from '../../../setup/test-helpers';
import * as jose from 'jose';

// 模拟依赖
jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: {
      findUnique: jest.fn(),
    },
    authorizationCode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    accessToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    tokenBlacklist: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// 模拟JWTUtils
jest.mock('@/lib/auth/oauth2', () => ({
  ...jest.requireActual('@/lib/auth/oauth2'),
  JWTUtils: {
    createAccessToken: jest.fn(),
    createRefreshToken: jest.fn(),
    createIdToken: jest.fn(),
    verifyRefreshToken: jest.fn(),
    getTokenHash: jest.fn(),
  },
}));

describe('OAuth2.1 令牌端点 (/api/v2/oauth/token)', () => {
  // 测试数据
  let testClient: any;
  let testUser: any;
  let testAuthCode: any;
  let validPKCEParams: { codeVerifier: string; codeChallenge: string };

  beforeAll(async () => {
    // 生成PKCE参数
    const codeVerifier = PKCEUtils.generateCodeVerifier();
    validPKCEParams = {
      codeVerifier,
      codeChallenge: PKCEUtils.generateCodeChallenge(codeVerifier),
    };
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // 创建测试数据
    testClient = createTestOAuthClient({
      clientId: 'test_client_001',
      clientSecret: 'test_secret_123',
      redirectUris: ['http://localhost:3000/callback'],
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 86400 * 30,
    });

    testUser = createTestUser({
      id: 'test_user_001',
      email: 'test@example.com',
      isActive: true,
    });

    testAuthCode = createTestAuthorizationCode({
      code: 'test_auth_code_123',
      clientId: testClient.id,
      userId: testUser.id,
      redirectUri: testClient.redirectUris[0],
      scope: 'openid profile',
      codeChallenge: validPKCEParams.codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10分钟后过期
      used: false,
    });

    // 设置模拟返回值
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(testClient);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
    (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(testAuthCode);
    
    // 模拟JWT生成
    (JWTUtils.createAccessToken as jest.Mock).mockResolvedValue('mock_access_token_jwt');
    (JWTUtils.createRefreshToken as jest.Mock).mockResolvedValue('mock_refresh_token_jwt');
    (JWTUtils.createIdToken as jest.Mock).mockResolvedValue('mock_id_token_jwt');
    (JWTUtils.getTokenHash as jest.Mock).mockReturnValue('mock_token_hash');
  });

  afterEach(async () => {
    await clearTestData();
  });

  describe('✅ 授权码授权 (authorization_code)', () => {
    test('应该成功交换授权码获取JWT令牌', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('access_token', 'mock_access_token_jwt');
      expect(responseData.data).toHaveProperty('token_type', 'Bearer');
      expect(responseData.data).toHaveProperty('expires_in');
      expect(responseData.data).toHaveProperty('refresh_token', 'mock_refresh_token_jwt');
      expect(responseData.data).toHaveProperty('scope', testAuthCode.scope);

      // 验证JWTUtils被正确调用
      expect(JWTUtils.createAccessToken).toHaveBeenCalledWith({
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: testAuthCode.scope,
        permissions: expect.any(Array),
      });

      expect(JWTUtils.createRefreshToken).toHaveBeenCalledWith({
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: testAuthCode.scope,
      });
    });

    test('应该拒绝无效的grant_type', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'password'); // 不支持的grant_type

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('unsupported_grant_type');
    });
  });

  describe('🔒 PKCE验证', () => {
    test('应该验证code_verifier与code_challenge匹配', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', 'wrong_verifier'); // 错误的verifier

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_grant');
    });
  });

  describe('🏢 客户端认证', () => {
    test('应该支持HTTP Basic认证', async () => {
      const credentials = btoa(`${testClient.clientId}:${testClient.clientSecret}`);
      
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
    });

    test('应该支持请求体中的客户端凭证', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      expect(responseData.success).toBe(true);
    });

    test('应该拒绝无效的客户端凭证', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', 'wrong_secret');
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_client');
    });
  });

  describe('🔄 刷新令牌授权 (refresh_token)', () => {
    let mockRefreshToken: any;

    beforeEach(() => {
      mockRefreshToken = {
        id: 'refresh_token_001',
        tokenHash: 'mock_refresh_hash',
        clientId: testClient.id,
        userId: testUser.id,
        scope: 'openid profile',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
        isRevoked: false,
        createdAt: new Date(),
      };

      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(mockRefreshToken);
      (JWTUtils.verifyRefreshToken as jest.Mock).mockResolvedValue({
        valid: true,
        payload: {
          sub: testUser.id,
          client_id: testClient.clientId,
          scope: 'openid profile',
          jti: 'refresh_jti_123',
        },
      });
    });

    test('应该成功使用刷新令牌获取新的访问令牌', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', 'mock_refresh_token_jwt');
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('access_token', 'mock_access_token_jwt');
      expect(responseData.data).toHaveProperty('token_type', 'Bearer');
      expect(responseData.data).toHaveProperty('expires_in');
      expect(responseData.data).toHaveProperty('refresh_token', 'mock_refresh_token_jwt');

      // 验证新令牌生成
      expect(JWTUtils.createAccessToken).toHaveBeenCalled();
      expect(JWTUtils.createRefreshToken).toHaveBeenCalled();
    });

    test('应该拒绝已撤销的刷新令牌', async () => {
      const revokedRefreshToken = { ...mockRefreshToken, isRevoked: true };
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(revokedRefreshToken);

      const formData = new FormData();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', 'revoked_refresh_token');
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_grant');
      expect(errorData.error.message).toContain('revoked');
    });

    test('应该支持scope缩减', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', 'mock_refresh_token_jwt');
      formData.append('scope', 'openid'); // 减少的scope
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      expect(responseData.data.scope).toBe('openid');
    });
  });

  describe('🤖 客户端凭证授权 (client_credentials)', () => {
    test('应该成功为客户端凭证模式生成访问令牌', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'client_credentials');
      formData.append('scope', 'api:read api:write');
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('access_token', 'mock_access_token_jwt');
      expect(responseData.data).toHaveProperty('token_type', 'Bearer');
      expect(responseData.data).toHaveProperty('expires_in');
      expect(responseData.data).not.toHaveProperty('refresh_token'); // 客户端凭证模式不返回刷新令牌
      
      // 验证JWT生成参数
      expect(JWTUtils.createAccessToken).toHaveBeenCalledWith({
        client_id: testClient.clientId,
        user_id: undefined, // 客户端凭证模式没有用户
        scope: 'api:read api:write',
        permissions: expect.any(Array),
      });
    });

    test('应该拒绝不支持客户端凭证模式的客户端', async () => {
      const clientWithoutCC = {
        ...testClient,
        allowClientCredentials: false,
      };
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(clientWithoutCC);

      const formData = new FormData();
      formData.append('grant_type', 'client_credentials');
      formData.append('scope', 'api:read');
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('unauthorized_client');
    });
  });

  describe('📋 参数验证', () => {
    test('应该拒绝不支持的grant_type', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'password'); // 不支持的grant_type
      formData.append('username', 'testuser');
      formData.append('password', 'testpass');

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('unsupported_grant_type');
    });

    test('应该要求Content-Type为application/x-www-form-urlencoded', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'test_code',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_request');
      expect(errorData.error.message).toContain('Content-Type');
    });

    test('应该拒绝缺少必需参数的请求', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      // 缺少其他必需参数

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.error.code).toBe('invalid_request');
    });
  });

  describe('🔐 Jose库JWT验证', () => {
    test('应该使用Jose库生成正确格式的JWT', async () => {
      // 模拟真实的JWT生成
      const realJWT = await generateTestJWT({
        sub: testUser.id,
        client_id: testClient.clientId,
        scope: 'openid profile',
        aud: 'api_resource',
      });
      
      (JWTUtils.createAccessToken as jest.Mock).mockResolvedValue(realJWT);

      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.data.access_token).toBe(realJWT);

      // 验证JWT可以被Jose库解析
      const decodedJWT = jose.decodeJwt(realJWT);
      expect(decodedJWT.sub).toBe(testUser.id);
      expect(decodedJWT.client_id).toBe(testClient.clientId);
    });

    test('应该在JWT中包含正确的声明', async () => {
      // 验证传递给JWTUtils的参数
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // 验证JWT创建时包含必要的声明
      expect(JWTUtils.createAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: testClient.clientId,
          user_id: testUser.id,
          scope: testAuthCode.scope,
          permissions: expect.any(Array),
        })
      );
    });
  });

  describe('⚡ 错误处理', () => {
    test('应该正确处理数据库错误', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', testAuthCode.code);
      formData.append('redirect_uri', testAuthCode.redirectUri);
      formData.append('client_id', testClient.clientId);
      formData.append('client_secret', testClient.clientSecret);
      formData.append('code_verifier', validPKCEParams.codeVerifier);

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const errorData = await response.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error.code).toBe('server_error');
    });

    test('应该设置正确的安全头部', async () => {
      const formData = new FormData();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', 'invalid_code');

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      // 检查安全头部
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
    });
  });
});

// 性能测试
describe('🚀 性能测试', () => {
  test('应该在合理时间内处理令牌请求', async () => {
    const formData = new FormData();
    formData.append('grant_type', 'client_credentials');
    formData.append('scope', 'api:read');
    formData.append('client_id', 'test_client');
    formData.append('client_secret', 'test_secret');

    const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
      method: 'POST',
      body: formData,
    });

    const startTime = Date.now();
    const response = await POST(request);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(2000); // 应该在2秒内响应
    expect(response).toBeDefined();
  }, 10000);
}); 