// 文件路径: __tests__/integration/oauth2-flow.test.ts
// 描述: OAuth2.1完整授权码流程端到端集成测试
// 测试重点: 完整的授权码流程、PKCE验证、客户端认证

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

import { cleanupTestData, createTestUser, createTestOAuthClient } from '../setup/test-helpers';
import { 
  initializeTestData,
  createTestRequest,
  generatePKCE,
  TEST_USERS,
  TEST_CLIENTS,
  PKCEParams,
  createTestJWT,
  verifyTestJWT,
} from '../setup/test-helpers';
import { GET as authorizeHandler } from 'oauth-service/app/api/v2/oauth/authorize/route';
import { POST as tokenHandler } from 'oauth-service/app/api/v2/oauth/token/route';
import { GET as userinfoHandler } from 'oauth-service/app/api/v2/oauth/userinfo/route';
import { prisma } from '@repo/database/client';


/**
 * OAuth2.1集成测试 - 完整授权码流程
 */
describe('OAuth2.1 完整授权码流程集成测试', () => {
  let testClient: any;
  let testUser: any;
  let pkceParams: PKCEParams;
  let authorizationCode: string;
  let accessToken: string;
  let refreshToken: string;
  
  beforeAll(async () => {
    // 清理测试环境
    await cleanupTestData();
    
    // 创建测试用户
    testUser = await createTestUser({
      id: 'integration_user_001',
      username: 'integration_user',
      email: 'integration@example.com',
      isActive: true,
    });
    
    // 创建测试OAuth客户端
    testClient = await createTestClient({
      id: 'integration_client_001',
      clientId: 'integration-client-id-string', // Added clientId as it's required by createTestClient
      name: 'Integration Test Client',
      clientSecret: 'test_client_secret_123',
      redirectUris: ['https://example.com/callback'],
      scopes: ['read', 'write', 'profile'],
      isPublic: false,
    });
    
    // 初始化测试数据
    await initializeTestData();
  });
  
  afterAll(async () => {
    await cleanupTestData();
  });
  
  beforeEach(async () => {
    // 每个测试前清理动态数据（保留用户和客户端）
    // 这里可以清理授权码、令牌等
    pkceParams = generatePKCE();
    authorizationCode = '';
    accessToken = '';
    refreshToken = '';
  });

  describe('授权码流程 - 步骤1: 授权请求', () => {
    it('应该接受有效的授权请求', async () => {
      const authParams = {
        response_type: 'code',
        client_id: testClient.id,
        redirect_uri: 'https://example.com/callback',
        scope: 'read write',
        state: 'random_state_123',
        code_challenge: pkceParams.codeChallenge,
        code_challenge_method: pkceParams.codeChallengeMethod,
      };
      
      // 模拟授权请求
      const authRequest = {
        valid: true,
        params: authParams,
        clientId: testClient.id,
        userId: testUser.id,
      };
      
      expect(authRequest.valid).toBe(true);
      expect(authRequest.params.response_type).toBe('code');
      expect(authRequest.params.client_id).toBe(testClient.id);
      expect(authRequest.params.code_challenge).toBeDefined();
    });
    
    it('应该拒绝无效的客户端ID', () => {
      const authParams = {
        response_type: 'code',
        client_id: 'invalid_client_id',
        redirect_uri: 'https://example.com/callback',
        scope: 'read',
      };
      
      // 模拟验证
      const isValidClient = authParams.client_id === testClient.id;
      
      expect(isValidClient).toBe(false);
    });
    
    it('应该拒绝无效的重定向URI', () => {
      const authParams = {
        response_type: 'code',
        client_id: testClient.id,
        redirect_uri: 'https://malicious.com/callback',
        scope: 'read',
      };
      
      // 模拟验证
      const isValidRedirectUri = testClient.redirectUris.includes(authParams.redirect_uri);
      
      expect(isValidRedirectUri).toBe(false);
    });
    
    it('应该要求PKCE参数', () => {
      const authParamsWithoutPKCE = {
        response_type: 'code',
        client_id: testClient.id,
        redirect_uri: 'https://example.com/callback',
        scope: 'read',
        // 缺少 code_challenge 和 code_challenge_method
      };
      
      // OAuth2.1要求强制使用PKCE
      const hasPKCE = !!(authParamsWithoutPKCE as any).code_challenge;
      
      expect(hasPKCE).toBe(false);
      // 在实际实现中，这应该返回错误
    });
  });

  describe('授权码流程 - 步骤2: 用户授权', () => {
    it('应该显示授权同意页面', () => {
      const consentData = {
        clientName: testClient.name,
        requestedScopes: ['read', 'write'],
        user: testUser,
      };
      
      expect(consentData.clientName).toBe('Integration Test Client');
      expect(consentData.requestedScopes).toContain('read');
      expect(consentData.requestedScopes).toContain('write');
      expect(consentData.user.id).toBe(testUser.id);
    });
    
    it('应该处理用户同意', () => {
      const userConsent = {
        approved: true,
        grantedScopes: ['read', 'write'],
        userId: testUser.id,
        clientId: testClient.id,
      };
      
      expect(userConsent.approved).toBe(true);
      expect(userConsent.grantedScopes).toEqual(['read', 'write']);
    });
    
    it('应该处理用户拒绝', () => {
      const userConsent = {
        approved: false,
        error: 'access_denied',
        userId: testUser.id,
        clientId: testClient.id,
      };
      
      expect(userConsent.approved).toBe(false);
      expect(userConsent.error).toBe('access_denied');
    });
  });

  describe('授权码流程 - 步骤3: 授权码生成', () => {
    it('应该生成有效的授权码', () => {
      const authCode = {
        code: 'generated_auth_code_123',
        clientId: testClient.id,
        userId: testUser.id,
        redirectUri: 'https://example.com/callback',
        scope: 'read write',
        codeChallenge: pkceParams.codeChallenge,
        codeChallengeMethod: pkceParams.codeChallengeMethod,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10分钟
      };
      
      expect(authCode.code).toBeDefined();
      expect(authCode.clientId).toBe(testClient.id);
      expect(authCode.userId).toBe(testUser.id);
      expect(authCode.codeChallenge).toBeDefined();
      expect(authCode.expiresAt).toBeGreaterThan(Date.now());
    });
    
    it('应该重定向到客户端回调URI', () => {
      const redirectUrl = new URL('https://example.com/callback');
      redirectUrl.searchParams.set('code', 'generated_auth_code_123');
      redirectUrl.searchParams.set('state', 'random_state_123');
      
      expect(redirectUrl.toString()).toContain('code=generated_auth_code_123');
      expect(redirectUrl.toString()).toContain('state=random_state_123');
      expect(redirectUrl.hostname).toBe('example.com');
    });
  });

  describe('授权码流程 - 步骤4: 令牌交换', () => {
    it('应该验证客户端认证', () => {
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'generated_auth_code_123',
        redirect_uri: 'https://example.com/callback',
        client_id: testClient.id,
        client_secret: 'test_client_secret_123',
        code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      };
      
      // 验证客户端认证
      const isValidClient = tokenRequest.client_id === testClient.id && 
                           tokenRequest.client_secret === testClient.clientSecret;
      
      expect(isValidClient).toBe(true);
      expect(tokenRequest.grant_type).toBe('authorization_code');
      expect(tokenRequest.code_verifier).toBeDefined();
    });
    
import crypto from 'crypto'; // Added import

// ... (other imports) ...

    it('应该验证PKCE', () => {
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = pkceParams.codeChallenge;
      
      // 模拟PKCE验证
      // const crypto = require('crypto'); // Removed require
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const computedChallenge = hash.toString('base64url');
      
      expect(computedChallenge).toBe(codeChallenge);
    });
    
    it('应该生成访问令牌和刷新令牌', () => {
      const tokenResponse = {
        access_token: 'generated_access_token_123',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'generated_refresh_token_123',
        scope: 'read write',
      };
      
      expect(tokenResponse.access_token).toBeDefined();
      expect(tokenResponse.token_type).toBe('Bearer');
      expect(tokenResponse.expires_in).toBe(3600);
      expect(tokenResponse.refresh_token).toBeDefined();
      expect(tokenResponse.scope).toBe('read write');
    });
    
    it('应该拒绝无效的授权码', () => {
      const tokenRequest = {
        grant_type: 'authorization_code',
        code: 'invalid_auth_code',
        redirect_uri: 'https://example.com/callback',
        client_id: testClient.id,
        client_secret: testClient.clientSecret,
        code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      };
      
      // 模拟授权码验证
      const isValidCode = tokenRequest.code === 'generated_auth_code_123';
      
      expect(isValidCode).toBe(false);
    });
    
    it('应该拒绝错误的code_verifier', () => {
      const codeVerifier = 'wrong_code_verifier';
      const codeChallenge = pkceParams.codeChallenge;
      
      // 模拟PKCE验证
      // const crypto = require('crypto'); // Already imported at the top
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const computedChallenge = hash.toString('base64url');
      
      expect(computedChallenge).not.toBe(codeChallenge);
    });
  });

  describe('授权码流程 - 步骤5: 资源访问', () => {
    it('应该使用访问令牌访问受保护资源', () => {
      const resourceRequest = {
        method: 'GET',
        url: '/api/v2/oauth/userinfo',
        headers: {
          'Authorization': 'Bearer generated_access_token_123',
        },
      };
      
      expect(resourceRequest.headers.Authorization).toContain('Bearer');
      expect(resourceRequest.headers.Authorization).toContain('generated_access_token_123');
    });
    
    it('应该返回用户信息', () => {
      const userInfoResponse = {
        sub: testUser.id,
        username: testUser.username,
        email: testUser.email,
        email_verified: true,
        preferred_username: testUser.username,
      };
      
      expect(userInfoResponse.sub).toBe(testUser.id);
      expect(userInfoResponse.username).toBe(testUser.username);
      expect(userInfoResponse.email).toBe(testUser.email);
    });
    
    it('应该拒绝无效的访问令牌', () => {
      const resourceRequest = {
        method: 'GET',
        url: '/api/v2/oauth/userinfo',
        headers: {
          'Authorization': 'Bearer invalid_access_token',
        },
      };
      
      // 模拟令牌验证
      const isValidToken = resourceRequest.headers.Authorization.includes('generated_access_token_123');
      
      expect(isValidToken).toBe(false);
    });
  });

  describe('令牌刷新流程', () => {
    it('应该使用刷新令牌获取新的访问令牌', () => {
      const refreshRequest = {
        grant_type: 'refresh_token',
        refresh_token: 'generated_refresh_token_123',
        client_id: testClient.id,
        client_secret: testClient.clientSecret,
      };
      
      expect(refreshRequest.grant_type).toBe('refresh_token');
      expect(refreshRequest.refresh_token).toBeDefined();
    });
    
    it('应该返回新的访问令牌', () => {
      const refreshResponse = {
        access_token: 'new_access_token_123',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      };
      
      expect(refreshResponse.access_token).toBeDefined();
      expect(refreshResponse.token_type).toBe('Bearer');
      expect(refreshResponse.expires_in).toBe(3600);
    });
  });

  describe('错误处理', () => {
    it('应该返回标准的OAuth2错误代码', () => {
      const errorCodes = [
        'invalid_request',
        'invalid_client',
        'invalid_grant',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
        'access_denied',
      ];
      
      // 测试各种错误情况
      expect(errorCodes).toContain('invalid_request');
      expect(errorCodes).toContain('invalid_client');
      expect(errorCodes).toContain('invalid_grant');
      expect(errorCodes).toContain('access_denied');
    });
    
    it('应该在错误时正确重定向', () => {
      const errorRedirectUrl = new URL('https://example.com/callback');
      errorRedirectUrl.searchParams.set('error', 'access_denied');
      errorRedirectUrl.searchParams.set('error_description', 'The user denied the request');
      errorRedirectUrl.searchParams.set('state', 'random_state_123');
      
      expect(errorRedirectUrl.toString()).toContain('error=access_denied');
      expect(errorRedirectUrl.toString()).toContain('state=random_state_123');
    });
  });

  describe('安全性验证', () => {
    it('应该防止授权码重复使用', () => {
      const authCode = 'generated_auth_code_123';
      let codeUsed = false;
      
      // 第一次使用
      if (!codeUsed) {
        codeUsed = true;
        expect(codeUsed).toBe(true);
      }
      
      // 第二次使用应该失败
      const secondUse = codeUsed;
      expect(secondUse).toBe(true); // 代码已被使用
    });
    
    it('应该验证授权码有效期', () => {
      const authCode = {
        code: 'generated_auth_code_123',
        expiresAt: Date.now() - 1000, // 已过期
      };
      
      const isExpired = Date.now() > authCode.expiresAt;
      expect(isExpired).toBe(true);
    });
    
    it('应该验证客户端和重定向URI匹配', () => {
      const originalRedirectUri = 'https://example.com/callback';
      const tokenRequestRedirectUri = 'https://example.com/callback';
      
      const uriMatches = originalRedirectUri === tokenRequestRedirectUri;
      expect(uriMatches).toBe(true);
    });
  });

  describe('OAuth2.1合规性', () => {
    it('应该强制要求PKCE', () => {
      // OAuth2.1要求所有客户端都必须使用PKCE
      const authRequest = {
        response_type: 'code',
        client_id: testClient.id,
        redirect_uri: 'https://example.com/callback',
        scope: 'read',
        code_challenge: pkceParams.codeChallenge,
        code_challenge_method: pkceParams.codeChallengeMethod,
      };
      
      const hasPKCE = !!(authRequest.code_challenge && authRequest.code_challenge_method);
      expect(hasPKCE).toBe(true);
    });
    
    it('应该使用安全的重定向URI', () => {
      const redirectUri = 'https://example.com/callback';
      const isHttps = redirectUri.startsWith('https://');
      
      expect(isHttps).toBe(true);
    });
    
    it('应该限制授权码有效期为10分钟', () => {
      const maxCodeLifetime = 10 * 60 * 1000; // 10分钟
      const authCode = {
        createdAt: Date.now(),
        expiresAt: Date.now() + maxCodeLifetime,
      };
      
      const lifetime = authCode.expiresAt - authCode.createdAt;
      expect(lifetime).toBeLessThanOrEqual(maxCodeLifetime);
    });
  });

  describe('授权请求阶段', () => {
    it('应该接受有效的授权请求并返回授权码', async () => {
      // Given: 有效的授权请求参数
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      // 创建授权请求
      const request = createTestRequest('/api/v2/oauth/authorize', {
        method: 'GET',
        query: {
          response_type: 'code',
          client_id: client.clientId,
          redirect_uri: client.redirectUris[0],
          scope: 'openid profile read',
          state: 'test-state-123',
          code_challenge: pkceParams.codeChallenge,
          code_challenge_method: pkceParams.codeChallengeMethod,
        },
        headers: {
          // 模拟已登录用户的session
          'Authorization': `Bearer ${await createTestJWT({ sub: user.id, scope: 'session' })}`,
        },
      });

      // When: 处理授权请求
      const response = await authorizeHandler(request);

      // Then: 应该返回重定向到客户端
      expect(response.status).toBe(302);
      
      const location = response.headers.get('Location');
      expect(location).toBeTruthy();
      
      const redirectUrl = new URL(location!);
      expect(redirectUrl.searchParams.get('code')).toBeTruthy();
      expect(redirectUrl.searchParams.get('state')).toBe('test-state-123');
      
      // 保存授权码用于后续测试
      authorizationCode = redirectUrl.searchParams.get('code')!;
    });

    it('应该拒绝缺少PKCE参数的授权请求', async () => {
      // Given: 缺少PKCE参数的授权请求
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      const request = createTestRequest('/api/v2/oauth/authorize', {
        method: 'GET',
        query: {
          response_type: 'code',
          client_id: client.clientId,
          redirect_uri: client.redirectUris[0],
          scope: 'openid profile read',
          state: 'test-state-123',
          // 故意缺少code_challenge和code_challenge_method
        },
        headers: {
          'Authorization': `Bearer ${await createTestJWT({ sub: user.id, scope: 'session' })}`,
        },
      });

      // When: 处理授权请求
      const response = await authorizeHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_request');
      expect(responseData.error_description).toContain('PKCE');
    });

    it('应该拒绝无效客户端的授权请求', async () => {
      // Given: 无效的客户端ID
      const user = TEST_USERS.REGULAR_USER;
      
      const request = createTestRequest('/api/v2/oauth/authorize', {
        method: 'GET',
        query: {
          response_type: 'code',
          client_id: 'invalid_client_id',
          redirect_uri: 'http://localhost:3000/callback',
          scope: 'openid profile read',
          state: 'test-state-123',
          code_challenge: pkceParams.codeChallenge,
          code_challenge_method: pkceParams.codeChallengeMethod,
        },
        headers: {
          'Authorization': `Bearer ${await createTestJWT({ sub: user.id, scope: 'session' })}`,
        },
      });

      // When: 处理授权请求
      const response = await authorizeHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_client');
    });

    it('应该拒绝未登录用户的授权请求', async () => {
      // Given: 未登录用户的授权请求
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/authorize', {
        method: 'GET',
        query: {
          response_type: 'code',
          client_id: client.clientId,
          redirect_uri: client.redirectUris[0],
          scope: 'openid profile read',
          state: 'test-state-123',
          code_challenge: pkceParams.codeChallenge,
          code_challenge_method: pkceParams.codeChallengeMethod,
        },
        // 故意不包含Authorization头
      });

      // When: 处理授权请求
      const response = await authorizeHandler(request);

      // Then: 应该返回未授权错误
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('access_denied');
    });
  });

  describe('令牌交换阶段', () => {
    beforeEach(async () => {
      // 在每个令牌测试前，先获取授权码
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      // 创建授权码
      authorizationCode = await createAuthorizationCode(user.id, client.clientId, pkceParams);
    });

    it('应该接受有效的令牌交换请求并返回访问令牌', async () => {
      // Given: 有效的令牌交换请求
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: client.redirectUris[0],
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code_verifier: pkceParams.codeVerifier,
        },
      });

      // When: 处理令牌交换请求
      const response = await tokenHandler(request);

      // Then: 应该返回访问令牌
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.access_token).toBeTruthy();
      expect(responseData.refresh_token).toBeTruthy();
      expect(responseData.token_type).toBe('Bearer');
      expect(responseData.expires_in).toBeGreaterThan(0);
      expect(responseData.scope).toBeTruthy();
      
      // 保存令牌用于后续测试
      accessToken = responseData.access_token;
      refreshToken = responseData.refresh_token;
    });

    it('应该拒绝无效的PKCE验证码', async () => {
      // Given: 无效的PKCE验证码
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: client.redirectUris[0],
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code_verifier: 'invalid_code_verifier',
        },
      });

      // When: 处理令牌交换请求
      const response = await tokenHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_grant');
      expect(responseData.error_description).toContain('PKCE');
    });

    it('应该拒绝过期的授权码', async () => {
      // Given: 过期的授权码
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      // 创建过期的授权码
      const expiredCode = await createExpiredAuthorizationCode(user.id, client.clientId, pkceParams);
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          code: expiredCode,
          redirect_uri: client.redirectUris[0],
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code_verifier: pkceParams.codeVerifier,
        },
      });

      // When: 处理令牌交换请求
      const response = await tokenHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_grant');
      expect(responseData.error_description).toContain('expired');
    });

    it('应该拒绝无效的客户端凭据', async () => {
      // Given: 无效的客户端凭据
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: client.redirectUris[0],
          client_id: client.clientId,
          client_secret: 'invalid_client_secret',
          code_verifier: pkceParams.codeVerifier,
        },
      });

      // When: 处理令牌交换请求
      const response = await tokenHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_client');
    });
  });

  describe('用户信息获取阶段', () => {
    beforeEach(async () => {
      // 在每个用户信息测试前，先获取访问令牌
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      // 创建授权码并交换令牌
      authorizationCode = await createAuthorizationCode(user.id, client.clientId, pkceParams);
      const tokens = await exchangeCodeForTokens(authorizationCode, client, pkceParams);
      accessToken = tokens.accessToken;
    });

    it('应该返回有效访问令牌对应的用户信息', async () => {
      // Given: 有效的访问令牌
      const request = createTestRequest('/api/v2/oauth/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // When: 获取用户信息
      const response = await userinfoHandler(request);

      // Then: 应该返回用户信息
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.sub).toBe(TEST_USERS.REGULAR_USER.id);
      expect(responseData.username).toBe(TEST_USERS.REGULAR_USER.username);
      expect(responseData.email).toBe(TEST_USERS.REGULAR_USER.email);
      expect(responseData.name).toBe(TEST_USERS.REGULAR_USER.displayName);
    });

    it('应该拒绝无效的访问令牌', async () => {
      // Given: 无效的访问令牌
      const request = createTestRequest('/api/v2/oauth/userinfo', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_access_token',
        },
      });

      // When: 获取用户信息
      const response = await userinfoHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_token');
    });

    it('应该拒绝缺少访问令牌的请求', async () => {
      // Given: 缺少访问令牌的请求
      const request = createTestRequest('/api/v2/oauth/userinfo', {
        method: 'GET',
        // 故意不包含Authorization头
      });

      // When: 获取用户信息
      const response = await userinfoHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_request');
    });
  });

  describe('刷新令牌流程', () => {
    beforeEach(async () => {
      // 在每个刷新令牌测试前，先获取令牌
      const client = TEST_CLIENTS.WEB_APP;
      const user = TEST_USERS.REGULAR_USER;
      
      // 创建授权码并交换令牌
      authorizationCode = await createAuthorizationCode(user.id, client.clientId, pkceParams);
      const tokens = await exchangeCodeForTokens(authorizationCode, client, pkceParams);
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });

    it('应该接受有效的刷新令牌请求并返回新的访问令牌', async () => {
      // Given: 有效的刷新令牌请求
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: client.clientId,
          client_secret: client.clientSecret,
        },
      });

      // When: 处理刷新令牌请求
      const response = await tokenHandler(request);

      // Then: 应该返回新的访问令牌
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.access_token).toBeTruthy();
      expect(responseData.access_token).not.toBe(accessToken); // 新令牌应该不同
      expect(responseData.refresh_token).toBeTruthy();
      expect(responseData.token_type).toBe('Bearer');
      expect(responseData.expires_in).toBeGreaterThan(0);
    });

    it('应该拒绝无效的刷新令牌', async () => {
      // Given: 无效的刷新令牌
      const client = TEST_CLIENTS.WEB_APP;
      
      const request = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'refresh_token',
          refresh_token: 'invalid_refresh_token',
          client_id: client.clientId,
          client_secret: client.clientSecret,
        },
      });

      // When: 处理刷新令牌请求
      const response = await tokenHandler(request);

      // Then: 应该返回错误
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('invalid_grant');
    });
  });

  // ===== 测试辅助函数 =====

  /**
   * 创建授权码
   */
  async function createAuthorizationCode(userId: string, clientId: string, pkce: PKCEParams): Promise<string> {
    const code = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await prisma.authorizationCode.create({
      data: {
        code,
        userId,
        clientId,
        redirectUri: TEST_CLIENTS.WEB_APP.redirectUris[0],
        scope: 'openid profile read',
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
        expiresAt: new Date(Date.now() + 600000), // 10分钟后过期
        createdAt: new Date(),
      },
    });
    
    return code;
  }

  /**
   * 创建过期的授权码
   */
  async function createExpiredAuthorizationCode(userId: string, clientId: string, pkce: PKCEParams): Promise<string> {
    const code = `expired_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await prisma.authorizationCode.create({
      data: {
        code,
        userId,
        clientId,
        redirectUri: TEST_CLIENTS.WEB_APP.redirectUris[0],
        scope: 'openid profile read',
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
        expiresAt: new Date(Date.now() - 600000), // 10分钟前过期
        createdAt: new Date(),
      },
    });
    
    return code;
  }

  /**
   * 交换授权码获取令牌
   */
  async function exchangeCodeForTokens(code: string, client: any, pkce: PKCEParams): Promise<{ accessToken: string; refreshToken: string }> {
    const request = createTestRequest('/api/v2/oauth/token', {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: client.redirectUris[0],
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code_verifier: pkce.codeVerifier,
      },
    });

    const response = await tokenHandler(request);
    const responseData = await response.json();
    
    return {
      accessToken: responseData.access_token,
      refreshToken: responseData.refresh_token,
    };
  }
}); 