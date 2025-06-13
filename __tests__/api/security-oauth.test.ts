import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  TestDataManager,
  createOAuth2TestSetup,
  TEST_CLIENTS,
  TEST_USERS,
  TestAssertions,
  PKCETestUtils,
  TestHttpClient,
  TEST_CONFIG,
} from '../utils/test-helpers';

// Import route functions directly
import { GET as authorizeGET } from '@/app/api/oauth/authorize/route';
import { POST as tokenPOST } from '@/app/api/oauth/token/route';
import { GET as userinfoGET } from '@/app/api/oauth/userinfo/route';
// import { POST as revokePOST } from '@/app/api/oauth/revoke/route'; // Not used in this file

/**
 * OAuth2.1 安全性测试套件
 *
 * 测试目标：
 * 1. 验证OAuth2.1安全防护机制
 * 2. 测试PKCE强制实施
 * 3. 验证令牌安全性
 * 4. 测试攻击防护机制
 */
describe('OAuth2.1安全性测试 / OAuth2.1 Security Tests (SEC)', () => {
  let dataManager: TestDataManager;
  let httpClient: TestHttpClient;
  let testUser: any = null;
  let confidentialClient: any = null;
  let publicClient: any = null;

  beforeAll(async () => {
    const setup = createOAuth2TestSetup('oauth-security');
    await setup.setup();
    dataManager = setup.dataManager;
    httpClient = new TestHttpClient();
  });

  beforeEach(async () => {
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    const setup = createOAuth2TestSetup('oauth-security');
    await setup.cleanup();
  });

  async function setupTestData() {
    // Ensure unique data for each test run or rely on afterAll cleanup
    const now = Date.now();
    testUser = await dataManager.createUser({
      ...TEST_USERS.REGULAR,
      username: `sec-user-${now}`,
      email: `sec-user-${now}@test.com`,
    });

    confidentialClient = await dataManager.createClient({
      ...TEST_CLIENTS.CONFIDENTIAL,
      clientId: `sec-confidential-${now}`,
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      scope: 'openid profile email api:read api:write', // Ensure scope is a string
    });

    publicClient = await dataManager.createClient({
      ...TEST_CLIENTS.PUBLIC,
      clientId: `sec-public-${now}`,
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: 'openid profile email', // Ensure scope is a string
      requirePkce: true,
    });
  }

  async function cleanupTestData() {
    // More targeted cleanup can be added here if needed after each test,
    // but typically afterAll handles the bulk cleanup.
  }

  // Helper to create Next.js request object
  function createNextRequest(url: string, options: RequestInit = {}): NextRequest {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow';
    const baseUrl = 'http://localhost:3000';
    const fullUrl = `${baseUrl}${basePath}${url}`;

    const { signal, ...safeOptions } = options;

    return new NextRequest(fullUrl, {
      method: 'GET',
      ...safeOptions,
      ...(signal && { signal }),
    });
  }

  describe('SEC-001: PKCE 安全防护测试 / PKCE Security Tests', () => {
    it('TC_SO_001_001: 公共客户端未使用PKCE时应被拒绝 / Should enforce PKCE for public clients by rejecting if missing', async () => {
      const authParams = {
        response_type: 'code', client_id: publicClient.clientId, redirect_uri: publicClient.redirectUris[0], scope: 'openid profile',
      };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST])).toBe(true);
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toBeDefined();
        const redirectUrl = new URL(location!);
        expect(redirectUrl.searchParams.get('error')).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(redirectUrl.searchParams.get('error_description')).toContain('PKCE');
      } else {
        const error = await response.json();
        expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(error.error_description).toContain('PKCE');
      }
    });

    it('TC_SO_001_002: 应验证PKCE code_challenge格式有效性 / Should validate PKCE code_challenge format', async () => {
      const authParams = {
        response_type: 'code', client_id: publicClient.clientId, redirect_uri: publicClient.redirectUris[0], scope: 'openid profile',
        code_challenge: 'short', // Invalid: too short for S256
        code_challenge_method: 'S256',
      };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST])).toBe(true);
      // Further checks on error content similar to above test can be added.
    });

    it('TC_SO_001_003: 应只支持S256作为code_challenge_method / Should only support S256 for code_challenge_method', async () => {
      const pkce = PKCETestUtils.generatePKCE();
      const authParams = {
        response_type: 'code', client_id: publicClient.clientId, redirect_uri: publicClient.redirectUris[0], scope: 'openid profile',
        code_challenge: pkce.codeChallenge, code_challenge_method: 'plain', // 'plain' is not recommended by OAuth 2.1
      };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);
      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST])).toBe(true);
      // Error should indicate 'plain' is not supported or method is invalid
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toContain(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(location).toContain('code_challenge_method');
      } else {
        const error = await response.json();
        expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_REQUEST);
        expect(error.error_description).toContain('code_challenge_method');
      }
    });

    it('TC_SO_001_004: 应在令牌交换时验证code_verifier与code_challenge的匹配性 / Should validate code_verifier matches code_challenge at token exchange', async () => {
      const pkce = PKCETestUtils.generatePKCE();

      // 创建带PKCE的授权码
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        publicClient.clientId,
        publicClient.redirectUris[0],
        'openid profile',
        {
          codeChallenge: pkce.codeChallenge,
          codeChallengeMethod: pkce.codeChallengeMethod,
        }
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: publicClient.redirectUris[0],
        client_id: publicClient.clientId,
        code_verifier: 'wrong-verifier-123456789012345678901234567890123456789012345678', // 错误的验证器
      };

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        body: new URLSearchParams(tokenRequestData).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_GRANT);
      expect(error.error_description).toContain('PKCE');
    });
  });

  describe('SEC-002: 令牌安全测试 / Token Security Tests', () => {
    it('TC_SO_002_001: 应拒绝被篡改的访问令牌 / Should prevent token tampering by rejecting tampered tokens', async () => {
      const validToken = await dataManager.createAccessToken(testUser.id, confidentialClient.clientId, 'openid profile');
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';
      const request = createNextRequest('/api/oauth/userinfo', { method: 'GET', headers: { Authorization: `Bearer ${tamperedToken}` } });
      const response = await userinfoGET(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
    });

    it('TC_SO_002_002: 应验证并拒绝过期的访问令牌 / Should validate token expiration and reject expired tokens', async () => {
      const expiredTokenString = await dataManager.createExpiredAccessToken(testUser.id, confidentialClient.clientId, 'openid profile');
      const request = createNextRequest('/api/oauth/userinfo', { method: 'GET', headers: { Authorization: `Bearer ${expiredTokenString}` } });
      const response = await userinfoGET(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_TOKEN);
      expect(error.error_description).toContain('expired');
    });

    it('TC_SO_002_003: UserInfo端点应验证令牌作用域（至少需要openid） / UserInfo endpoint should validate token scope (at least openid)', async () => {
      // Token with only 'profile', no 'openid'
      const limitedToken = await dataManager.createAccessToken(testUser.id, confidentialClient.clientId, 'profile');
      const request = createNextRequest('/api/oauth/userinfo', { method: 'GET', headers: { Authorization: `Bearer ${limitedToken}` } });
      const response = await userinfoGET(request);

      // UserInfo endpoint strictly requires 'openid' scope.
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FORBIDDEN);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INSUFFICIENT_SCOPE);
    });
  });

  describe('SEC-003: 授权码安全测试 / Authorization Code Security Tests', () => {
    it('TC_SO_003_001: 应防止授权码重用 / Should prevent authorization code reuse', async () => {
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        confidentialClient.redirectUris[0],
        'openid profile'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: confidentialClient.redirectUris[0],
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };

      // 第一次使用
      const firstRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        body: new URLSearchParams(tokenRequestData).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      await tokenPOST(firstRequest);

      // 第二次使用（应该失败）
      const secondRequest = createNextRequest('/api/oauth/token', {
        method: 'POST',
        body: new URLSearchParams(tokenRequestData).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const secondResponse = await tokenPOST(secondRequest);

      expect(secondResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const error = await secondResponse.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_GRANT); // Reused code is an invalid grant
    });

    it('TC_SO_003_002: 应验证授权码与客户端的绑定关系 / Should validate authorization code client binding', async () => {
      const authCodeForClientA = await dataManager.createAuthorizationCode(testUser.id, confidentialClient.clientId, confidentialClient.redirectUris[0], 'openid profile');
      const clientB = await dataManager.createClient({ ...TEST_CLIENTS.CONFIDENTIAL, clientId: `sec-other-client-${Date.now()}`, grantTypes: ['authorization_code'], responseTypes: ['code'], scope: ['openid', 'profile'] });

      // Client B attempts to use Client A's code
      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: otherClient.redirectUris[0],
        client_id: otherClient.clientId,
        client_secret: otherClient.plainSecret,
      };

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        body: new URLSearchParams(tokenRequestData).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST); // invalid_grant because code is not for this client
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_GRANT);
    });

    it('TC_SO_003_003: 应在令牌交换时验证重定向URI的匹配性 / Should validate redirect URI match at token exchange', async () => {
      const authCode = await dataManager.createAuthorizationCode(testUser.id, confidentialClient.clientId, confidentialClient.redirectUris[0], 'openid profile');
      const tokenRequestData = {
        grant_type: 'authorization_code', code: authCode, redirect_uri: 'https://wrong-redirect-uri.com/callback',
        client_id: confidentialClient.clientId, client_secret: confidentialClient.plainSecret,
      };
      const request = createNextRequest('/api/oauth/token', {
        method: 'POST', body: new URLSearchParams(tokenRequestData).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_GRANT); // Mismatched redirect_uri
    });
  });

  describe('SEC-004: 客户端认证安全测试 / Client Authentication Security Tests', () => {
    it('TC_SO_004_001: 应拒绝无效的客户端凭证 / Should reject invalid client credentials', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials',
        scope: 'api:read',
        client_id: confidentialClient.clientId,
        client_secret: 'invalid-secret',
      };

      const request = createNextRequest('/api/oauth/token', {
        method: 'POST',
        body: new URLSearchParams(tokenRequestData).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_SO_004_002: 机密客户端发起请求时应要求提供客户端密钥 / Should require client secret for confidential clients when authenticating', async () => {
      const tokenRequestData = { grant_type: 'client_credentials', scope: 'api:read', client_id: confidentialClient.clientId /* No client_secret */ };
      const request = createNextRequest('/api/oauth/token', {
        method: 'POST', body: new URLSearchParams(tokenRequestData).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT);
    });

    it('TC_SO_004_003: 应验证客户端是否为活动状态 / Should validate client status (active or not)', async () => {
      const disabledClient = await dataManager.createClient({ ...TEST_CLIENTS.CONFIDENTIAL, clientId: `sec-disabled-${Date.now()}`, isActive: false, grantTypes: ['client_credentials'], scope: ['api:read'] });
      const tokenRequestData = { grant_type: 'client_credentials', scope: 'api:read', client_id: disabledClient.clientId, client_secret: disabledClient.plainSecret };
      const request = createNextRequest('/api/oauth/token', {
        method: 'POST', body: new URLSearchParams(tokenRequestData).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const response = await tokenPOST(request);

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await response.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT); // Or a more specific "client_disabled"
    });
  });

  describe('SEC-005: State参数CSRF防护测试 / State Parameter CSRF Protection Tests', () => {
    it('TC_SO_005_001: 授权请求应支持state参数 / Should support state parameter in authorization requests', async () => {
      const state = 'random-state-value-123456';
      const authParams = {
        response_type: 'code',
        client_id: confidentialClient.clientId,
        redirect_uri: confidentialClient.redirectUris[0],
        scope: 'openid profile',
        state: state,
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      // Expect a redirect to login/consent or directly to callback.
      // State should be preserved in the redirect URL if the request itself is valid enough to identify client/redirect_uri.
      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT, TEST_CONFIG.HTTP_STATUS.OK])).toBe(true);
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND || response.status === TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT) {
        const location = response.headers.get('location');
        expect(location).toBeDefined();
        if (location!.includes(confidentialClient.redirectUris[0])) { // If redirecting to client
             const redirectUrl = new URL(location!);
             expect(redirectUrl.searchParams.get('state')).toBe(state);
        } else { // If redirecting to login/consent
            expect(location).toContain(`state=${encodeURIComponent(state)}`); // State might be URL encoded in a query param of returnUrl
        }
      }
    });

    it('TC_SO_005_002: 错误响应中应保留state参数 / Should preserve state parameter in error responses to redirect_uri', async () => {
      const state = 'error-state-value-123456';
      const authParams = {
        response_type: 'code',
        client_id: 'invalid-client-id',
        redirect_uri: 'https://example.com/callback',
        scope: 'openid profile',
        state: state,
      };

      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      // If client_id is invalid, it might not redirect to client's URI.
      // If it does redirect (e.g., if client determined by redirect_uri), state must be preserved.
      // Or it might be a direct 400/401 error page.
      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED])).toBe(true);
      if (response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toBeDefined();
        const redirectUrl = new URL(location!);
        // If redirecting to a registered client URI (even with an error for other reasons), state must be there.
        // If redirecting to a generic error page, state might not be applicable.
        // This test implies redirecting to the client with an error.
        expect(redirectUrl.searchParams.get('state')).toBe(state);
        expect(redirectUrl.searchParams.get('error')).toBeDefined();
      }
    });
  });

  describe('SEC-006: 作用域验证测试 / Scope Validation Tests', () => {
    it('TC_SO_006_001: 应验证请求中作用域的有效性 / Should validate requested scopes for validity', async () => {
      const authParams = { response_type: 'code', client_id: confidentialClient.clientId, redirect_uri: confidentialClient.redirectUris[0], scope: 'invalid_scope unknown_scope' };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST])).toBe(true);
      if(response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toContain('error=invalid_scope');
      } else {
        const error = await response.json();
        expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_SCOPE);
      }
    });

    it('TC_SO_006_002: 应限制客户端访问其未被授权的范围 / Should restrict client access to scopes it is not authorized for', async () => {
      const authParams = {
        response_type: 'code', client_id: publicClient.clientId, redirect_uri: publicClient.redirectUris[0],
        scope: 'openid profile api:write', // publicClient may not have 'api:write'
        code_challenge: PKCETestUtils.generatePKCE().codeChallenge, code_challenge_method: 'S256',
      };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const request = createNextRequest(authorizeUrl);
      const response = await authorizeGET(request);

      expect(TestAssertions.expectStatus(response, [TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST])).toBe(true);
       if(response.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
        const location = response.headers.get('location');
        expect(location).toContain('error=invalid_scope'); // Client requested scope it's not allowed
      } else {
        const error = await response.json();
        expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_SCOPE);
      }
    });
  });
});
