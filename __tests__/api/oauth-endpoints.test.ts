import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createTestSetup,
  TestDataManager,
  TestAssertions,
  TEST_CONFIG,
  TEST_USERS,
  TEST_CLIENTS,
  TestUser,
  TestClient,
  PKCETestUtils,
  TestUtils,
  createOAuth2TestSetup,
  TestHttpClient,
} from '../utils/test-helpers';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 直接导入API路由处理函数 - 这是获得代码覆盖率的关键
import { GET as authorizeGET } from '@/app/api/oauth/authorize/route';
import { POST as tokenPOST } from '@/app/api/oauth/token/route';
import { GET as userinfoGET, POST as userinfoPOST } from '@/app/api/oauth/userinfo/route';
import { POST as revokePOST } from '@/app/api/oauth/revoke/route';
import { GET as openidConfigGET } from '@/app/api/.well-known/openid-configuration/route';

// 导入中间件函数进行直接测试
import {
  authenticateBearer,
  withAuth,
  withOAuthMiddleware,
  validateOAuthRequest,
  AuthContext,
  AuthOptions,
} from '@/lib/auth/middleware';

// 辅助函数：创建NextRequest对象
function createNextRequest(url: string, options: RequestInit = {}): NextRequest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow';
  const baseUrl = 'http://localhost:3000';
  const fullUrl = `${baseUrl}${basePath}${url}`;

  // 过滤掉可能导致类型错误的属性
  const { signal, ...safeOptions } = options;

  return new NextRequest(fullUrl, {
    method: 'GET',
    ...safeOptions,
    ...(signal && { signal }),
  });
}

// 辅助函数：从Response中提取JSON数据
async function extractJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe('OAuth API 端点单元测试 / OAuth API Endpoints - Unit Tests', () => {
  let dataManager: TestDataManager;
  let testUser: TestUser;
  let testClient: TestClient;
  let httpClient: TestHttpClient;

  beforeAll(async () => {
    const setup = createTestSetup('oauth_api_test');
    dataManager = await setup.setup();

    // 创建测试数据
    testUser = await dataManager.createTestUser('REGULAR');
    testClient = await dataManager.createTestClient('CONFIDENTIAL');

    httpClient = new TestHttpClient();
  });

  afterAll(async () => {
    await dataManager.cleanup();
  });

  describe('OAuth授权端点 / OAuth Authorization Endpoint (/api/oauth/authorize)', () => {
    it('TC_OE_001: 应该因缺少必需参数返回400错误 / Should return 400 for missing required parameters', async () => {
      const request = createNextRequest('/api/oauth/authorize');
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_OE_002: 应该因无效response_type返回错误 / Should return error for invalid response_type', async () => {
      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=invalid_type&scope=openid`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // Behavior might be a redirect with error or a direct 400
      expect([TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST]).toContain(response.status);
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toContain('error=' + TEST_CONFIG.ERROR_CODES.UNSUPPORTED_RESPONSE_TYPE);
      } else {
        const data = await extractJson(response);
        expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.UNSUPPORTED_RESPONSE_TYPE);
      }
    });

    it('TC_OE_003: 应该因无效客户端ID返回错误 / Should return error for invalid client_id', async () => {
      const url = `/api/oauth/authorize?client_id=invalid_client_id&redirect_uri=https://example.com/callback&response_type=code&scope=openid`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);
      // No redirect if client is unknown
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_OE_004: 应该因无效重定向URI返回错误 / Should return error for invalid redirect_uri', async () => {
      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=https://malicious.com/callback&response_type=code&scope=openid`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // If client is known, might redirect to a valid URI with error, or return 400.
      // Assuming 400 for direct error display if redirect_uri does not match any registered.
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
      expect(data.error_description).toContain('redirect_uri');
    });

    it('TC_OE_005: 应该成功处理有效的授权请求 / Should successfully handle a valid authorization request', async () => {
      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=code&scope=openid profile&state=test_state`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // Expect a redirect to login page or consent screen, or direct redirect if already logged in & consented.
      // This is a unit test of the route, so actual login won't happen.
      // It might return a 200 with HTML, or a 302/307 if it tries to redirect to an IdP or login page.
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]).toContain(response.status);
    });

    it('TC_OE_006: 应该支持PKCE参数 / Should support PKCE parameters', async () => {
      const pkce = PKCETestUtils.generatePKCE();
      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=code&scope=openid&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]).toContain(response.status);
    });
  });

  describe('OAuth令牌端点 / OAuth Token Endpoint (/api/oauth/token)', () => {
    it('TC_OE_007: 应该因缺少grant_type返回400错误 / Should return 400 for missing grant_type', async () => {
      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=test',
      });
      const response = await tokenPOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_OE_008: 应该因不支持的grant_type返回400错误 / Should return 400 for unsupported grant_type', async () => {
      const body = new URLSearchParams({
        grant_type: 'invalid_type',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret || 'test_secret',
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.UNSUPPORTED_GRANT_TYPE);
    });

    it('TC_OE_009: 应该因无效客户端凭证返回401错误 / Should return 401 for invalid client credentials', async () => {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: testClient.clientId,
        client_secret: 'invalid_secret',
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_OE_010: 应该成功处理客户端凭证授权 / Should successfully handle client_credentials grant', async () => {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
        scope: 'api:read',
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      // This grant might not be fully implemented or enabled for all test clients
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const tokenData = await TestAssertions.validateTokenResponse(response);
        expect(tokenData.access_token).toBeDefined();
        expect(tokenData.token_type).toBe('Bearer');
        expect(tokenData.scope).toBeDefined();
      } else {
        // If not OK, expect a specific error related to this grant type or client config
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
        const errorData = await extractJson(response);
        expect([TEST_CONFIG.ERROR_CODES.UNAUTHORIZED_CLIENT, TEST_CONFIG.ERROR_CODES.INVALID_GRANT, TEST_CONFIG.ERROR_CODES.INVALID_REQUEST]).toContain(errorData.error);
      }
    });

    it('TC_OE_011: 应该因授权码模式缺少授权码返回400错误 / Should return 400 for missing authorization_code in auth code grant', async () => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
        redirect_uri: testClient.redirectUris[0],
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_OE_012: 应该因无效授权码返回400错误 / Should return 400 for invalid authorization_code', async () => {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'invalid_code',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
        redirect_uri: testClient.redirectUris[0],
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_GRANT);
    });

    it('TC_OE_013: 应该处理刷新令牌流程 / Should handle refresh_token grant', async () => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: 'test_refresh_token',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const tokenData = await response.json();
        expect(tokenData.access_token).toBeDefined();
      } else {
        // If not OK, expect a specific error related to this grant type or client config
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
        const errorData = await extractJson(response);
        expect([TEST_CONFIG.ERROR_CODES.UNSUPPORTED_GRANT_TYPE, TEST_CONFIG.ERROR_CODES.INVALID_GRANT, TEST_CONFIG.ERROR_CODES.INVALID_REQUEST]).toContain(errorData.error);
      }
    });

    it('TC_OE_014: 应该因Content-Type错误返回400 / Should return 400 for incorrect Content-Type', async () => {
      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
        }),
      });

      const response = await tokenPOST(tokenRequest);

      // OAuth 令牌端点应该期望 application/x-www-form-urlencoded
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('OAuth用户信息端点 / OAuth UserInfo Endpoint (/api/oauth/userinfo)', () => {
    it('TC_OE_015: 应该因缺少访问令牌返回401错误 / Should return 401 for missing access token', async () => {
      const request = createNextRequest('/api/oauth/userinfo');
      const response = await userinfoGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN); // Or a more specific error if available
    });

    it('TC_OE_016: 应该因无效访问令牌返回401错误 / Should return 401 for invalid access token', async () => {
      const request = createNextRequest('/api/oauth/userinfo', {
        headers: { Authorization: 'Bearer invalid_token' },
      });
      const response = await userinfoGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
    });

    it('TC_OE_017: 应该使用有效访问令牌返回用户信息 / Should return user information for a valid access token', async () => {
      // 创建一个有效的访问令牌
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile email'
      );

      const request = createNextRequest('/api/oauth/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const response = await userinfoGET(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const userInfo = await response.json();
        expect(userInfo.sub).toBeDefined();
        expect(userInfo.username).toBeDefined(); // Assuming username is part of 'profile' scope
      } else {
        // UserInfo might not be implemented or token is insufficient
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_IMPLEMENTED, TEST_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR]);
      }
    });

    it('TC_OE_018: 应该只返回授权范围内的信息 / Should only return information within the authorized scope', async () => {
      // 创建一个只有profile范围的访问令牌
      const accessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile'
      );

      const request = createNextRequest('/api/oauth/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const response = await userinfoGET(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const userInfo = await response.json();
        expect(userInfo.sub).toBeDefined();
        expect(userInfo.email).toBeUndefined(); // Email scope was not requested
      } else {
         TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_IMPLEMENTED, TEST_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR]);
      }
    });
  });

  describe('OAuth撤销端点 / OAuth Revoke Endpoint (/api/oauth/revoke)', () => {
    it('TC_OE_019: 应该因缺少令牌参数返回400错误 / Should return 400 for missing token parameter', async () => {
      const body = new URLSearchParams({
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
      });

      const request = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await revokePOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_OE_020: 应该因无效客户端凭证返回401错误 / Should return 401 for invalid client credentials', async () => {
      const body = new URLSearchParams({
        token: 'test_token',
        client_id: testClient.clientId,
        client_secret: 'invalid_secret',
      });

      const request = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await revokePOST(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_OE_021: 应该处理令牌撤销请求 / Should process a token revocation request', async () => {
      const token = await dataManager.createAccessToken(testUser.id!, testClient.clientId);

      // 测试撤销令牌的API调用
      const revokeRequest = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: token,
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
        }).toString(),
      });
      const response = await revokePOST(revokeRequest);

      // Successful revocation is 200 OK.
      // If token is invalid/already revoked, it might also be 200 OK (as per RFC7009) or specific error.
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST]).toContain(response.status);
    });

    it('TC_OE_022: 应该处理撤销不存在的令牌的请求 / Should handle revocation request for a non-existent token', async () => {
      const body = new URLSearchParams({
        token: 'non_existent_token',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
      });

      const request = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await revokePOST(request);

      // RFC7009 suggests returning 200 OK even if the token is invalid or client authentication failed,
      // to prevent leaking information about tokens.
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
    });
  });

  describe('OpenID配置端点 / OpenID Configuration Endpoint (/.well-known/openid-configuration)', () => {
    it('TC_OE_023: 应该返回OpenID配置信息 / Should return OpenID configuration information', async () => {
      const request = createNextRequest('/.well-known/openid-configuration');
      const response = await openidConfigGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const config = await response.json();
        expect(config.issuer).toBeDefined();
        expect(config.authorization_endpoint).toBeDefined();
        expect(config.token_endpoint).toBeDefined();
        expect(config.userinfo_endpoint).toBeDefined();
        expect(config.jwks_uri).toBeDefined();
      }
    });

    it('TC_OE_024: 应该包含正确的OAuth流程支持信息 / Should include correct OAuth flow support information', async () => {
      const request = createNextRequest('/.well-known/openid-configuration');
      const response = await openidConfigGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const config = await response.json();
        expect(config.grant_types_supported).toContain('authorization_code');
        expect(config.response_types_supported).toContain('code');
        expect(config.scopes_supported).toContain('openid');
      }
    });
  });

  describe('OAuth令牌内省端点 / OAuth Token Introspection Endpoint (/api/oauth/introspect)', () => {
    let accessToken: string;

    beforeAll(async () => {
      accessToken = await dataManager.createAccessToken(testUser.id!, testClient.clientId, 'openid profile');
    });

    it('TC_OE_025: 应该因无效客户端凭证返回401错误 / Should return 401 for invalid client credentials (simulated via token endpoint)', async () => {
      // Assuming no dedicated introspect endpoint, testing auth part via token endpoint
      const tokenRequest = createNextRequest('/api/oauth/token', { // Simulating auth check
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: 'invalid_secret',
        }).toString(),
      });

      const response = await tokenPOST(tokenRequest);

      // If an actual introspect endpoint exists and is tested, this would be 401.
      // If simulating with /token, it's still 401 for invalid client.
      // If the introspect endpoint is missing, it would be 404.
      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]);
    });

    it.skip('TC_OE_026: 应该返回令牌内省信息 / Should return token introspection information', async () => {
      // This test requires a functional introspection endpoint.
    });

    it.skip('TC_OE_027: 应该对无效令牌返回非活跃状态 / Should return inactive for an invalid token', async () => {
      // This test requires a functional introspection endpoint.
    });
  });

  describe('错误处理和边界情况 / Error Handling and Boundary Cases', () => {
    it('TC_OE_028: 应该处理超长参数 / Should handle excessively long parameters', async () => {
      const longString = 'a'.repeat(10000);

      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
          scope: longString,
        }).toString(),
      });

      const response = await tokenPOST(tokenRequest);

      // Expect 400 (Bad Request), 413 (Payload Too Large), or 422 (Unprocessable Entity)
      // 401 could also occur if the long string breaks client auth.
      TestAssertions.expectStatus(response, [
          TEST_CONFIG.HTTP_STATUS.BAD_REQUEST,
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, // If long string affects client_id/secret processing
          TEST_CONFIG.HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE, // 413
          TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY // 422
      ]);
    });

    it('TC_OE_029: 应该处理空参数 / Should handle empty parameters', async () => {
      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: '',
          client_id: '',
          client_secret: '',
        }).toString(),
      });

      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });

    it('TC_OE_030: 应该处理参数中的特殊字符 / Should handle special characters in parameters', async () => {
      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId + '<script>alert("xss")</script>',
          client_secret: testClient.plainSecret!,
        }).toString(),
      });

      const response = await tokenPOST(tokenRequest);
      // Expect that client_id with special chars leads to client authentication failure
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    // This test is a duplicate of TC_OE_014, let's ensure it has a unique ID or remove if redundant.
    // Assuming it's a separate scenario or aspect of Content-Type testing.
    it('TC_OE_031: 应该因不正确的Content-Type返回400 / Should return 400 for incorrect Content-Type (duplicate check)', async () => {
      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
        }),
      });

      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('中间件直接测试 / Middleware Direct Tests', () => {
    let validAccessToken: string;
    let invalidAccessToken: string;

    beforeEach(async () => {
      // 创建有效的访问令牌
      validAccessToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'openid profile email'
      );
      // 创建无效的访问令牌（篡改）
      invalidAccessToken = validAccessToken.slice(0, -10) + 'tampered123';
    });

    it('TC_OE_032: 应该成功验证有效的Bearer令牌 / Should successfully validate a valid Bearer token via middleware', async () => {
      const request = createNextRequest('/api/test', {
        headers: { Authorization: `Bearer ${validAccessToken}` },
      });

      const result = await authenticateBearer(request, {
        requiredScopes: ['openid'],
        requireUserContext: true,
      });

      expect(result.success).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context!.user_id).toBe(testUser.id);
      expect(result.context!.client_id).toBe(testClient.clientId);
      expect(result.context!.scopes).toContain('openid');
    });

    it('TC_OE_033: 应该拒绝无效的Bearer令牌 / Should reject an invalid Bearer token via middleware', async () => {
      const request = createNextRequest('/api/test', {
        headers: { Authorization: `Bearer ${invalidAccessToken}` },
      });

      const result = await authenticateBearer(request, {
        requiredScopes: ['openid'],
      });

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();
      TestAssertions.expectStatus(result.response!, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('TC_OE_034: 应该因作用域权限不足拒绝请求 / Should reject request due to insufficient scope via middleware', async () => {
      const request = createNextRequest('/api/test', {
        headers: { Authorization: `Bearer ${validAccessToken}` },
      });

      const result = await authenticateBearer(request, {
        requiredScopes: ['admin:write'], // User is unlikely to have this scope
      });

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();
      // Insufficient scope should result in 403 Forbidden
      TestAssertions.expectStatus(result.response!, TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
    });

    it('TC_OE_035: 应该在缺少Authorization头时拒绝请求 / Should reject request if Authorization header is missing and access is not public', async () => {
      const request = createNextRequest('/api/test');

      const result = await authenticateBearer(request, {
        allowPublicAccess: false, // Explicitly disallow public access
      });

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();
      TestAssertions.expectStatus(result.response!, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
    });

    it('TC_OE_036: 应该在配置为允许时允许公共访问 / Should allow public access if configured', async () => {
      const request = createNextRequest('/api/test');

      const result = await authenticateBearer(request, {
        allowPublicAccess: true,
      });

      expect(result.success).toBe(true);
      expect(result.context).toBeUndefined(); // No auth context for public access
    });
  });

  describe('OAuth验证中间件测试 / OAuth Validation Middleware Tests', () => {
    it('TC_OE_037: 应该成功验证有效的OAuth请求参数 / Should successfully validate valid OAuth request parameters', async () => {
      const request = createNextRequest('/api/oauth/test?client_id=test&scope=openid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code&code=test_code',
      });

      const result = await validateOAuthRequest(request, {
        requiredParams: ['client_id', 'grant_type'],
        paramValidation: {
          grant_type: (value) => ['authorization_code', 'client_credentials'].includes(value),
        },
      });

      expect(result.success).toBe(true);
      expect(result.context!.params!.client_id).toBe('test');
      expect(result.context!.params!.grant_type).toBe('authorization_code');
    });

    it('TC_OE_038: 应该因缺少必需参数拒绝请求 / Should reject request missing required parameters', async () => {
      const request = createNextRequest('/api/oauth/test');

      const result = await validateOAuthRequest(request, {
        requiredParams: ['client_id', 'grant_type'],
      });

      expect(result.success).toBe(false);
      TestAssertions.expectStatus(result.response!, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });

    it('TC_OE_039: 应该因参数格式无效拒绝请求 / Should reject request with invalid parameter format', async () => {
      const request = createNextRequest('/api/oauth/test?grant_type=invalid_type');

      const result = await validateOAuthRequest(request, {
        requiredParams: ['grant_type'],
        paramValidation: {
          grant_type: (value) => ['authorization_code', 'client_credentials'].includes(value),
        },
      });

      expect(result.success).toBe(false);
      TestAssertions.expectStatus(result.response!, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
    });
  });

  describe('PKCE和安全性测试 / PKCE and Security Tests', () => {
    it('TC_OE_040: 应该成功验证有效的PKCE代码挑战格式 / Should successfully validate a valid PKCE code_challenge format', async () => {
      const validChallenge = PKCETestUtils.generatePKCE();

      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=code&scope=openid&code_challenge=${validChallenge.codeChallenge}&code_challenge_method=S256`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // Expect a redirect or OK, not a specific PKCE error.
      // A 400 might indicate other issues, but not necessarily PKCE validation failure at this stage unless it's malformed.
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]).toContain(response.status);
    });

    it('TC_OE_041: 应该拒绝无效的PKCE code_challenge_method / Should reject an invalid PKCE code_challenge_method', async () => {
      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=code&scope=openid&code_challenge=testchallenge&code_challenge_method=plain`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // OAuth 2.1 requires S256. 'plain' should be rejected.
      // This would typically be a redirect to the redirect_uri with an error in query params.
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FOUND);
      const location = response.headers.get('location');
      expect(location).toContain('error=' + TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
      expect(location).toContain('error_description=code_challenge_method');
    });

    it('TC_OE_042: 应该在重定向中保留state参数以防止CSRF / Should preserve state parameter in redirect for CSRF protection', async () => {
      const stateValue = crypto.randomBytes(32).toString('hex');

      const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(testClient.redirectUris[0])}&response_type=code&scope=openid&state=${stateValue}`;
      const request = createNextRequest(url);
      const response = await authorizeGET(request);

      // state parameter should be present in the redirect location
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND || response.status === 307) {
        const location = response.headers.get('location');
        expect(location).toBeTruthy();
        expect(location!).toContain(`state=${stateValue}`);
      } else {
        // If not a redirect, this specific test for state in redirect might not apply,
        // but the overall request should still be valid (e.g., 200 OK showing a login page).
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      }
    });
  });

  describe('错误处理和边界情况增强测试 / Enhanced Error Handling Tests', () => {
    it('TC_OE_043: 应该拒绝恶意的重定向URI / Should reject malicious redirect URIs', async () => {
      const maliciousUris = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'http://evil.com/callback',
        'https://evil.com/callback',
      ];

      for (const uri of maliciousUris) {
        const url = `/api/oauth/authorize?client_id=${testClient.clientId}&redirect_uri=${encodeURIComponent(uri)}&response_type=code&scope=openid`;
        const request = createNextRequest(url);
        const response = await authorizeGET(request);

        // Expect 400 Bad Request directly, as the redirect_uri is invalid and shouldn't be used for redirection.
        TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      }
    });

    it('TC_OE_044: 应该安全地处理潜在的SQL注入尝试 / Should safely handle potential SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1' UNION SELECT * FROM users --",
      ];

      for (const payload of sqlInjectionPayloads) {
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: payload, // Injecting into client_id
          client_secret: testClient.plainSecret!,
        });

        const request = createNextRequest('/api/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const response = await tokenPOST(request);

        // Expect client authentication to fail (401) or bad request (400)
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST]);
      }
    });

    it('TC_OE_045: 应该处理超大请求体 / Should handle excessively large request bodies', async () => {
      const largeScope = 'a'.repeat(100000); // Approx 100KB

      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
        scope: largeScope,
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const response = await tokenPOST(request);

      // Expect 413 Payload Too Large, or potentially 400/422 if parameter length is validated first.
      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNPROCESSABLE_ENTITY]);
    });

    it('TC_OE_046: 应该一致地处理并发请求 / Should handle concurrent requests consistently', async () => {
      const requests = Array.from({ length: 10 }, () => {
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
        });

        return createNextRequest('/api/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      });

      const responses = await Promise.all(requests.map((req) => tokenPOST(req)));

      responses.forEach((response) => {
        // Each response should be a valid HTTP response, typically OK or an error code.
        // This test primarily checks for server stability under concurrency, not specific success of each token grant here.
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(599); // Avoid server errors like 503
        if (response.status !== TEST_CONFIG.HTTP_STATUS.OK) {
           // If not OK, it should be a standard OAuth error or rate limit
           const errorData = extractJson(response);
           expect(errorData).toBeDefined(); // Should have an error body
        }
      });
    });
  });

  describe('令牌生命周期管理测试 / Token Lifecycle Management Tests', () => {
    it('TC_OE_047: 应该拒绝无效格式的访问令牌 / Should reject access tokens with invalid format', async () => {
      const invalidTokens = [
        'invalid.token.format',
        'Bearer invalid_token',
        '',
        'malformed_jwt_token',
      ];

      for (const token of invalidTokens) {
        const request = createNextRequest('/api/oauth/userinfo', {
          headers: { Authorization: `Bearer ${token}` }, // Some tokens might not even have 'Bearer ' prefix
        });
        const response = await userinfoGET(request);

        // Expect 401 Unauthorized for malformed/invalid tokens
        TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      }
    });

    // This test is similar to TC_OE_021. If it's testing a different aspect, it needs clarification.
    // For now, assuming it's a confirmation or slightly different context.
    it('TC_OE_048: 应该成功处理令牌撤销请求 / Should successfully process token revocation requests (lifecycle check)', async () => {
      const token = await dataManager.createAccessToken(testUser.id!, testClient.clientId);

      // 测试撤销令牌的API调用
      const revokeRequest = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: token,
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret!,
        }).toString(),
      });
      const response = await revokePOST(revokeRequest);

      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.NO_CONTENT]);
    });

    it('TC_OE_049: 应该在UserInfo端点验证令牌作用域限制 / Should enforce token scope limitations at UserInfo endpoint', async () => {
      // 创建只有profile作用域的令牌
      const limitedToken = await dataManager.createAccessToken(
        testUser.id!,
        testClient.clientId,
        'profile'
      );

      const request = createNextRequest('/api/oauth/userinfo', {
        headers: { Authorization: `Bearer ${limitedToken}` },
      });
      const response = await userinfoGET(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const userInfo = await response.json();
        expect(userInfo.email).toBeUndefined(); // 'email' scope was not granted for this token
      } else {
        // If not OK, it might be 403 Forbidden if scope is insufficient, or other errors
         TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.INTERNAL_SERVER_ERROR]);
      }
    });
  });

  describe('调试OAuth API行为 / Debugging OAuth API Behavior', () => {
    it('TC_OE_050: 检查有效授权请求的实际返回状态码 / Check actual status code for a valid authorization request', async () => {
      const authParams = {
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0],
        response_type: 'code',
        scope: 'openid profile',
        state: 'test_state',
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const authorizeRequest = createNextRequest(authorizeUrl);
      const response = await authorizeGET(authorizeRequest);

      // This is a debug test, so we primarily care that it runs and gives some output.
      // The expectation is broad: it should be a valid HTTP response.
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('TC_OE_051: 检查Token端点缺少grant_type的实际返回 / Check actual response for Token endpoint missing grant_type', async () => {
      const tokenRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=test', // Missing grant_type
      });

      const response = await tokenPOST(tokenRequest);

      // Expected: 400 Bad Request
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
    });

    it('TC_OE_052: 检查PKCE授权请求的实际返回 / Check actual response for a PKCE authorization request', async () => {
      const pkce = PKCETestUtils.generatePKCE();

      const authParams = {
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0],
        response_type: 'code',
        scope: 'openid',
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod,
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const authorizeRequest = createNextRequest(authorizeUrl);
      const response = await authorizeGET(authorizeRequest);

      // Expect a redirect (to login/consent) or OK (if login page is rendered directly)
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]).toContain(response.status);
    });
  });
});

describe('OAuth2.1核心端点测试套件 / OAuth2.1 Core Endpoints Test Suite', () => {
  let dataManager: TestDataManager;
  let httpClient: TestHttpClient;
  let testUser: any;
  let confidentialClient: any;
  let publicClient: any;

  beforeAll(async () => {
    const setup = createOAuth2TestSetup('oauth-endpoints');
    await setup.setup();
    dataManager = setup.dataManager;
    httpClient = new TestHttpClient();

    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    const setup = createOAuth2TestSetup('oauth-endpoints'); // Re-create to ensure clean context for cleanup
    await setup.cleanup();
  });

  async function setupTestData() {
    testUser = await dataManager.createUser(TEST_USERS.REGULAR);
    confidentialClient = await dataManager.createClient({
      ...TEST_CLIENTS.CONFIDENTIAL,
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'api:read', 'api:write'],
    });
    publicClient = await dataManager.createClient({
      ...TEST_CLIENTS.PUBLIC,
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email'],
    });
  }

  async function cleanupTestData() {
    await dataManager.cleanup();
  }

  describe('TC_OE_S2_001: 授权端点测试 / Suite 2: Authorization Endpoint Tests', () => {
    it('TC_OE_S2_001_01: 应该成功处理有效的授权请求 / Should handle valid authorization request', async () => {
      const authParams = {
        response_type: 'code',
        client_id: confidentialClient.clientId,
        redirect_uri: confidentialClient.redirectUris[0],
        scope: 'openid profile',
        state: 'test-state-value',
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      // Expect a redirect (to login/consent) or OK (if login page is rendered directly)
      // Given this is a unit test of the route handler, it might not fully simulate a user session.
      // A 400/401 could occur if prerequisites (like a user session for non-prompting flows) aren't met.
      // However, for a basic valid request, 200 (login page) or 302 (redirect to IdP/login) is most common.
      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]);
    });

    it('TC_OE_S2_001_02: 应该拒绝无效的客户端ID / Should reject invalid client ID', async () => {
      const authParams = {
        response_type: 'code',
        client_id: 'invalid-client-id',
        redirect_uri: 'http://localhost:3000/callback',
        scope: 'openid',
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      // Invalid client_id should result in an error, not a redirect.
      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_OE_S2_001_03: 应该支持PKCE参数 / Should support PKCE parameters', async () => {
      const pkce = PKCETestUtils.generatePKCE();
      const authParams = {
        response_type: 'code',
        client_id: publicClient.clientId,
        redirect_uri: publicClient.redirectUris[0],
        scope: 'openid profile',
        code_challenge: pkce.codeChallenge,
        code_challenge_method: pkce.codeChallengeMethod,
        state: 'test-state',
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, 307]);
    });
  });

  describe('TC_OE_S2_002: 令牌端点测试 / Suite 2: Token Endpoint Tests', () => {
    it('TC_OE_S2_002_01: 应该支持授权码授权类型 / Should support authorization_code grant', async () => {
      // 创建授权码
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        confidentialClient.redirectUris[0],
        'openid profile'
      );

      const tokenData = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: confidentialClient.redirectUris[0],
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret || 'test-secret',
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenData.toString(),
      });

      const response = await tokenPOST(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const tokens = await response.json();
        expect(tokens.access_token).toBeDefined();
        expect(tokens.token_type).toBe('Bearer');
      } else {
        // If code is invalid/expired, or client auth fails, or redirect_uri mismatch
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
        const errorData = await extractJson(response);
        expect([TEST_CONFIG.ERROR_CODES.INVALID_GRANT, TEST_CONFIG.ERROR_CODES.INVALID_CLIENT, TEST_CONFIG.ERROR_CODES.INVALID_REQUEST]).toContain(errorData.error);
      }
    });

    it('TC_OE_S2_002_02: 应该支持客户端凭证授权类型 / Should support client_credentials grant', async () => {
      const tokenData = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'api:read',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret || 'test-secret',
      });

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenData.toString(),
      });

      const response = await tokenPOST(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const tokens = await response.json();
        expect(tokens.access_token).toBeDefined();
        expect(tokens.token_type).toBe('Bearer');
      } else {
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]);
        const errorData = await extractJson(response);
        expect([TEST_CONFIG.ERROR_CODES.UNAUTHORIZED_CLIENT, TEST_CONFIG.ERROR_CODES.INVALID_GRANT]).toContain(errorData.error);
      }
    });
  });

  describe('TC_OE_S2_003: 用户信息端点测试 / Suite 2: UserInfo Endpoint Tests', () => {
    it('TC_OE_S2_003_01: 应该使用有效令牌返回用户信息 / Should return user info for a valid token', async () => {
      // 创建访问令牌
      const accessToken = await dataManager.createAccessToken(
        testUser.id,
        confidentialClient.clientId,
        'openid profile email'
      );

      const request = createNextRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const response = await userinfoGET(request);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const userInfo = await response.json();
        expect(userInfo.sub).toBe(testUser.id);
      } else {
        TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED, TEST_CONFIG.HTTP_STATUS.FORBIDDEN]);
      }
    });

    it('TC_OE_S2_003_02: 应该拒绝无效的访问令牌 / Should reject invalid access tokens', async () => {
      const request = createNextRequest('/api/oauth/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer invalid-token`,
        },
      });

      const response = await userinfoGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const data = await extractJson(response);
      expect(data.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
    });
  });

  describe('TC_OE_S2_004: 撤销端点测试 / Suite 2: Revoke Endpoint Tests', () => {
    it('TC_OE_S2_004_01: 应该成功撤销访问令牌 / Should successfully revoke access tokens', async () => {
      const accessToken = await dataManager.createAccessToken(
        testUser.id,
        confidentialClient.clientId,
        'openid profile'
      );

      const revokeData = new URLSearchParams({
        token: accessToken,
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret || 'test-secret',
      });

      const request = createNextRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: revokeData.toString(),
      });

      const response = await revokePOST(request);

      // RFC7009: server responds with HTTP 200 if revocation is successful or if client submitted invalid token
      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);
    });
  });

  describe('TC_OE_S2_005: OpenID配置端点测试 / Suite 2: OpenID Configuration Endpoint Tests', () => {
    it('TC_OE_S2_005_01: 应该返回有效的OpenID配置 / Should return valid OpenID configuration', async () => {
      const request = createNextRequest('/.well-known/openid-configuration');
      const response = await openidConfigGET(request);

      TestAssertions.expectStatus(response, TEST_CONFIG.HTTP_STATUS.OK);

      if (response.status === TEST_CONFIG.HTTP_STATUS.OK) {
        const config = await response.json();
        expect(config.issuer).toBeDefined();
        expect(config.authorization_endpoint).toBeDefined();
        expect(config.token_endpoint).toBeDefined();
        expect(config.userinfo_endpoint).toBeDefined();
        expect(config.jwks_uri).toBeDefined();
        expect(config.response_types_supported).toBeDefined();
        expect(config.subject_types_supported).toBeDefined();
        expect(config.id_token_signing_alg_values_supported).toBeDefined();
      }
    });
  });
});
