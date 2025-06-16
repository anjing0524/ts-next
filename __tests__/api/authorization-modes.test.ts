import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { addMinutes } from 'date-fns';
import { NextRequest } from 'next/server';
import {
  TestDataManager,
  createOAuth2TestSetup,
  TEST_CLIENTS,
  TEST_USERS,
  TestAssertions,
  PKCETestUtils,
} from '../utils/test-helpers';

// Import route functions directly for code coverage
import { GET as authorizeGET } from '@/app/api/oauth/authorize/route';
import { POST as tokenPOST } from '@/app/api/oauth/token/route';

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

// Helper function to create token requests
function createTokenRequest(requestData: Record<string, string>): NextRequest {
  return createNextRequest('/api/oauth/token', {
    method: 'POST',
    body: new URLSearchParams(requestData).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

// Helper function to create authorize requests
function createAuthorizeRequest(authParams: Record<string, string>): NextRequest {
  const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
  return createNextRequest(authorizeUrl);
}

// Helper function to parse URL query parameters (from oauth-authorize-unit.test.ts)
function parseQuery(url: string): Record<string, string> {
  const query: Record<string, string> = {};
  const queryString = url.split('?')[1];
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return query;
}

describe('授权模式测试 / Authorization Modes Tests (AM)', () => {
  let testUser: any = null;
  let confidentialClient: any = null;
  let publicClient: any = null;
  let dataManager: TestDataManager;

  beforeAll(async () => {
    const setup = createOAuth2TestSetup('authorization-modes');
    await setup.setup();
    dataManager = setup.dataManager;
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    const setup = createOAuth2TestSetup('authorization-modes'); // Re-create for clean context
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
      grantTypes: ['authorization_code', 'implicit'], // Ensure implicit is allowed for relevant tests
      responseTypes: ['code', 'token', 'id_token'],
      scope: ['openid', 'profile', 'email'],
    });
  }

  async function cleanupTestData() {
    await dataManager.cleanup();
  }

  describe('AM-001: 授权码流程 / Authorization Code Flow', () => {
    it('TC_AM_001_001: 机密客户端应完成完整的授权码流程 / Should complete full authorization code flow for confidential client', async () => {
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        'https://app.example.com/callback',
        'openid profile email'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'https://app.example.com/callback',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };

      const tokenRequest = createTokenRequest(tokenRequestData);
      const tokenResponse = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(tokenResponse, 200);
      const tokens = await tokenResponse.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expires_in).toBeDefined();
    });

    it('TC_AM_001_002: 应拒绝重用的授权码 / Should reject reused authorization codes', async () => {
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        'https://app.example.com/callback',
        'openid profile'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'https://app.example.com/callback',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };

      // First use
      const firstTokenRequest = createTokenRequest(tokenRequestData);
      const firstResponse = await tokenPOST(firstTokenRequest);

      // Second use (should fail)
      const secondTokenRequest = createTokenRequest(tokenRequestData);
      const secondResponse = await tokenPOST(secondTokenRequest);

      TestAssertions.expectStatus(secondResponse, 400);
      const error = await secondResponse.json();
      expect(error.error).toBe('invalid_grant');

      const dbAuthCode = await prisma.authorizationCode.findFirst({
        where: { code: authCode },
      });
      expect(dbAuthCode?.used).toBe(true);
    });

    it('TC_AM_001_003: 应拒绝过期的授权码 / Should reject expired authorization codes', async () => {
      const expiredAuthCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        'https://app.example.com/callback',
        'openid profile',
        new Date(Date.now() - 1000 * 60 * 15) // Expired 15 minutes ago
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: expiredAuthCode,
        redirect_uri: 'https://app.example.com/callback',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
      expect(error.error_description).toContain('expired');
    });

    it('TC_AM_001_004: 当客户端ID不匹配时应拒绝授权码 / Should reject authorization code with client_id mismatch', async () => {
      const client2 = await dataManager.createClient({ ...TEST_CLIENTS.CONFIDENTIAL_ALT, grantTypes: ['authorization_code'] });
      const authCodeForClient1 = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId, // Code issued to client1
        'https://app.example.com/callback',
        'openid'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCodeForClient1,
        redirect_uri: 'https://app.example.com/callback',
        client_id: client2.clientId, // Attempting exchange with client2
        client_secret: client2.plainSecret!,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      // Client auth (client2) passes, but code was for client1 -> invalid_grant
      expect(error.error).toBe('invalid_grant');
      expect(error.error_description).toContain('issued to a different client');
    });

    it('TC_AM_001_005: 当redirect_uri不匹配时应拒绝授权码 / Should reject authorization code with redirect_uri mismatch', async () => {
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        'https://app.example.com/correct-callback', // Code issued with this URI
        'openid'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'https://app.example.com/wrong-callback', // Attempting exchange with different URI
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
      expect(error.error_description).toContain('Redirect URI does not match');
    });

    it('TC_AM_001_006: 如果授权码包含challenge但请求缺少code_verifier，应拒绝 / Should reject request missing code_verifier if code had challenge (PKCE)', async () => {
      const pkce = PKCETestUtils.generatePKCE();
      const authCodeWithChallenge = await dataManager.createAuthorizationCode(
        testUser.id,
        publicClient.clientId,
        'https://spa.example.com/callback',
        'openid',
        undefined, // not expired
        pkce.codeChallenge,
        pkce.codeChallengeMethod
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCodeWithChallenge,
        redirect_uri: 'https://spa.example.com/callback',
        client_id: publicClient.clientId,
        // Missing code_verifier
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_request');
      expect(error.error_description).toContain('Code verifier required');
    });

    it('TC_AM_001_007: 如果code_verifier不正确应拒绝请求 / Should reject request with incorrect code_verifier (PKCE)', async () => {
      const pkce = PKCETestUtils.generatePKCE();
      const authCodeWithChallenge = await dataManager.createAuthorizationCode(
        testUser.id,
        publicClient.clientId,
        'https://spa.example.com/callback',
        'openid',
        undefined,
        pkce.codeChallenge,
        pkce.codeChallengeMethod
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCodeWithChallenge,
        redirect_uri: 'https://spa.example.com/callback',
        client_id: publicClient.clientId,
        code_verifier: 'incorrect_verifier_'.repeat(5), // Incorrect verifier
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
      expect(error.error_description).toContain('PKCE verification failed');
    });

    it('TC_AM_001_008: 公共客户端应支持PKCE（成功流程） / Should support PKCE for public clients (successful flow)', async () => {
      const pkce = PKCETestUtils.generatePKCE();

      const client = await prisma.client.findUnique({
        where: { clientId: publicClient.clientId },
      });

      if (!client) {
        throw new Error(`Client ${publicClient.clientId} not found`);
      }

      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'pkce-test-code-' + crypto.randomBytes(8).toString('hex'),
          clientId: client.id,
          userId: testUser.id,
          redirectUri: 'https://spa.example.com/callback',
          scope: 'openid profile',
          expiresAt: addMinutes(new Date(), 10),
          codeChallenge: pkce.codeChallenge,
          codeChallengeMethod: pkce.codeChallengeMethod,
        },
      });

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode.code,
        redirect_uri: 'https://spa.example.com/callback',
        client_id: publicClient.clientId,
        code_verifier: pkce.codeVerifier,
      };

      const tokenRequest = createTokenRequest(tokenRequestData);
      const tokenResponse = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(tokenResponse, 200);
      const tokens = await tokenResponse.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');

      await prisma.authorizationCode.deleteMany({ where: { id: authCode.id } });
    });
  });

  describe('AM-004: 刷新令牌流程 / Refresh Token Flow', () => {
    let initialAccessToken: string;
    let initialRefreshToken: string;

    beforeAll(async () => {
      const authCode = await dataManager.createAuthorizationCode(
        testUser.id,
        confidentialClient.clientId,
        'https://app.example.com/callback',
        'openid profile email api:read offline_access'
      );

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'https://app.example.com/callback',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);
      if (response.status !== 200) {
        const errorBody = await response.text();
        throw new Error(`Failed to get initial tokens for refresh token tests: ${errorBody}`);
      }
      const tokens = await response.json();
      initialAccessToken = tokens.access_token;
      initialRefreshToken = tokens.refresh_token;
      expect(initialRefreshToken).toBeDefined(); // Ensure RT was actually issued
    });

    it('TC_AM_004_001: 应成功刷新访问令牌 / Should successfully refresh an access token', async () => {
      const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: initialRefreshToken,
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();

      expect(tokens.access_token).toBeDefined();
      expect(tokens.access_token).not.toBe(initialAccessToken);
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBeDefined();
      expect(tokens.refresh_token).toBeDefined(); // New RT might be issued if rotation is on
      expect(tokens.scope).toContain('openid');
      expect(tokens.scope).toContain('profile');
      expect(tokens.scope).toContain('api:read');

      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Pragma')).toBe('no-cache');

      // Further test: if rotation is on, old RT should be invalid.
      // This requires knowing the rotation setting or attempting to use old RT.
    });

    it('TC_AM_004_002: 应拒绝无效或已撤销的刷新令牌 / Should reject invalid/revoked refresh token', async () => {
      const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: 'invalid-or-revoked-refresh-token',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
    });

    it('TC_AM_004_003: 应拒绝过期的刷新令牌 / Should reject expired refresh token', async () => {
      const expiredRefreshToken = await dataManager.createRefreshToken(
        testUser.id,
        confidentialClient.clientId,
        'openid',
        new Date(Date.now() - 1000 * 60 * 60 * 24 * 31) // Expired 31 days ago
      );

      const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: expiredRefreshToken,
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
      expect(error.error_description).toContain('Refresh token has expired');
    });

    it('TC_AM_004_004: 应授予相同或更窄的范围 / Should grant same or narrower scopes', async () => {
       const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: initialRefreshToken,
        scope: 'openid profile api:read', // Narrower or same as original 'openid profile email api:read offline_access'
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      expect(tokens.scope).toBe('openid profile api:read');
    });

    it('TC_AM_004_005: 如果请求了更广的范围，应限制为最初授予的范围 / Should restrict to originally granted scopes if wider scopes requested', async () => {
       const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: initialRefreshToken, // Original: 'openid profile email api:read offline_access'
        scope: 'openid profile api:read api:write', // 'api:write' is wider
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      expect(tokens.scope).not.toContain('api:write');
      expect(tokens.scope).toContain('openid');
      expect(tokens.scope).toContain('profile');
      expect(tokens.scope).toContain('api:read');
    });

     it('TC_AM_004_006: 如果未请求范围，应成功（默认为原始RT范围） / Should succeed with no scope requested (defaults to original RT scopes)', async () => {
      const refreshTokenRequestData = {
        grant_type: 'refresh_token',
        refresh_token: initialRefreshToken,
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(refreshTokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      // offline_access is usually not included in the access token's scope string.
      // The effective scopes granted by the original RT are 'openid profile email api:read offline_access'.
      expect(tokens.scope).toContain('openid');
      expect(tokens.scope).toContain('profile');
      expect(tokens.scope).toContain('email');
      expect(tokens.scope).toContain('api:read');
    });
  });

  describe('AM-003: 客户端凭证流程 / Client Credentials Flow', () => {
    it('TC_AM_003_001: 应成功使用客户端凭证进行身份验证 / Should successfully authenticate with client credentials', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials',
        scope: 'api:read api:write',
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret,
      };

      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);

      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBeDefined();
      expect(tokens.scope).toBe('api:read api:write');

      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Pragma')).toBe('no-cache');
    });

    it('TC_AM_003_002: 客户端凭证请求scope格式无效时应拒绝 / Should reject client credentials request with invalid scope format', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials',
        scope: 'api:read\napi:write', // Invalid character
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_scope');
    });

    it('TC_AM_003_003: 客户端凭证请求不允许的scope时应拒绝 / Should reject client credentials request for scopes not allowed for the client', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials',
        scope: 'api:read api:forbidden', // 'api:forbidden' not in client's allowed scopes
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('invalid_scope');
    });

    it('TC_AM_003_004: 应授予客户端scope的有效子集 / Should grant valid subset of client scopes', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials',
        scope: 'api:read', // Allowed scope
        client_id: confidentialClient.clientId,
        client_secret: confidentialClient.plainSecret!,
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.scope).toBe('api:read');
    });

    it('TC_AM_003_005: 如果未请求scope，应授予客户端默认scope（或无scope） / Should grant client default scopes if no scope requested (or no scope if no default)', async () => {
      const defaultScopeClient = await dataManager.createClient({
        ...TEST_CLIENTS.CLIENT_CREDS_DEFAULT_SCOPE, // Assuming this client has specific default scopes or just allowed scopes
        grantTypes: ['client_credentials'],
        scope: 'default:read default:write',
      });

      const tokenRequestData = {
        grant_type: 'client_credentials',
        client_id: defaultScopeClient.clientId,
        client_secret: defaultScopeClient.plainSecret!,
        // No scope parameter
      };
      const tokenRequest = createTokenRequest(tokenRequestData);
      const response = await tokenPOST(tokenRequest);
      TestAssertions.expectStatus(response, 200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      // OAuth 2.0: if scope is omitted, server may use a pre-defined default or fail.
      // Current behavior: issues token with no scope if not requested.
      expect(tokens.scope).toBeUndefined();
    });
  });

  describe('AM-005: 隐式流程 / Implicit Flow', () => {
    it('TC_AM_005_001: 应支持SPA的隐式流程 / Should support implicit flow for single-page applications', async () => {
      const authParams = {
        response_type: 'token', // Key for implicit flow
        client_id: publicClient.clientId, // Must be a public client typically
        redirect_uri: publicClient.redirectUris[0], // Ensure this URI is registered for the client
        scope: 'openid profile',
        state: 'random-state-value-' + Date.now(),
      };

      const authorizeRequest = createAuthorizeRequest(authParams);
      const response = await authorizeGET(authorizeRequest);

      // Implicit flow (if user is authenticated and consent is given/not required)
      // redirects to the redirect_uri with access_token in the URL fragment.
      // The status code should be 302 Found.
      // If auth/consent is needed, it might redirect to /login or /consent (also 302).
      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toBeDefined();

      if (location!.includes(publicClient.redirectUris[0])) {
        // Successful implicit grant, token in fragment
        expect(location).toMatch(/#access_token=.+&token_type=Bearer&expires_in=\d+&scope=.+&state=.+/);
      } else {
        // Redirect to login or consent
        expect(location).toMatch(/\/login|\/consent/);
      }
    });
  });
});

describe('AM-006: 授权端点（用户认证与同意） / Authorize Endpoint (User Auth & Consent)', () => {
  let userForAuthTestsLocal: any; // Use local to this describe block to avoid conflicts if outer has same name
  let clientForAuthTestsLocal: any;
  let pkceChallengeLocal: { codeChallenge: string; codeChallengeMethod: string; codeVerifier: string };

  beforeAll(async () => {
    userForAuthTestsLocal = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'auth-consent-user-' + Date.now() });
    clientForAuthTestsLocal = await dataManager.createClient({
      ...TEST_CLIENTS.PUBLIC,
      clientId: 'auth-consent-client-' + Date.now(),
      redirectUris: ['https://client.example.com/callback'],
      scope: 'openid profile email offline_access', // Ensure broad scope for testing subsets
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      requireConsent: true,
      requirePkce: true,
    });
    pkceChallengeLocal = PKCETestUtils.generatePKCE();
  });

  function createAuthRequestForSuite(params: Record<string, string>): NextRequest {
    const defaultParams = {
      client_id: clientForAuthTestsLocal.clientId,
      redirect_uri: clientForAuthTestsLocal.redirectUris[0],
      response_type: 'code',
      scope: 'openid profile', // Default scope for requests
      state: 'state-' + Date.now(),
      code_challenge: pkceChallengeLocal.codeChallenge,
      code_challenge_method: pkceChallengeLocal.codeChallengeMethod,
    };
    return createAuthorizeRequest({ ...defaultParams, ...params });
  }

  describe('用户认证场景 / User Authentication Scenarios', () => {
    it('TC_AM_006_001: 如果没有活动会话，应重定向到登录页面（模拟）/ Should redirect to login if no active session (simulated)', async () => {
      const request = createAuthRequestForSuite({});
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain('/login');
      const loginUrlParams = new URL(location!, 'http://localhost').searchParams;
      expect(loginUrlParams.get('returnUrl')).toContain(`/api/oauth/authorize?client_id=${clientForAuthTestsLocal.clientId}`);
    });

    it('TC_AM_006_002: 如果prompt=login，即使会话可能存在，也应重定向到登录（模拟）/ Should redirect to login if prompt=login, even if session might exist (simulated)', async () => {
      const request = createAuthRequestForSuite({ prompt: 'login' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain('/login');
    });

    it('TC_AM_006_003: prompt=none且无活动会话（模拟）应重定向到客户端并带login_required错误 / prompt=none with no active session (simulated) should redirect to client with login_required error', async () => {
      const request = createAuthRequestForSuite({ prompt: 'none' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain(clientForAuthTestsLocal.redirectUris[0]);
      const query = parseQuery(location!);
      expect(query.error).toBe('login_required');
      expect(query.state).toBeDefined();
    });

    it('TC_AM_006_004: 如果auth_time过旧，max_age会触发重新登录（目前通过prompt=login模拟）/ max_age triggers re-login if auth_time too old (simulated by prompt=login for now)', async () => {
        const request = createAuthRequestForSuite({ max_age: '0', prompt: 'login' });
        const response = await authorizeGET(request);
        TestAssertions.expectStatus(response, 302);
        const location = response.headers.get('Location');
        expect(location).toContain('/login');
    });

    it('TC_AM_006_005: prompt=none与max_age和旧会话（模拟）应产生login_required / prompt=none with max_age and old session (simulated) should yield login_required', async () => {
        const request = createAuthRequestForSuite({ prompt: 'none', max_age: '1' });
        const response = await authorizeGET(request);

        TestAssertions.expectStatus(response, 302);
        const location = response.headers.get('Location');
        expect(location).toContain(clientForAuthTestsLocal.redirectUris[0]);
        const query = parseQuery(location!);
        expect(query.error).toBe('login_required');
    });
  });

  describe('用户同意场景（假设用户已认证）/ User Consent Scenarios (assuming user is authenticated)', () => {
    it('TC_AM_006_006: client.requireConsent=false，用户已认证时应直接颁发授权码（模拟认证）/ client.requireConsent=false should issue code directly if user authenticated (simulated auth)', async () => {
      const noConsentClient = await dataManager.createClient({
        ...clientForAuthTestsLocal, // Base new client on existing one
        clientId: 'no-consent-client-' + Date.now(),
        requireConsent: false,
      });
      const request = createAuthRequestForSuite({ client_id: noConsentClient.clientId, scope: 'openid' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain(noConsentClient.redirectUris[0]);
      const query = parseQuery(location!);
      expect(query.code).toBeDefined();
      expect(query.state).toBeDefined();
    });

    it('TC_AM_006_007: client.requireConsent=true，无同意记录 -> 重定向到同意页面（模拟认证）/ client.requireConsent=true, no consent -> redirect to consent page (simulated auth)', async () => {
      await prisma.consentGrant.deleteMany({ where: { userId: userForAuthTestsLocal.id, clientId: clientForAuthTestsLocal.id }});
      const request = createAuthRequestForSuite({ scope: 'openid profile' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain('/consent');
      const consentUrlParams = new URL(location!, 'http://localhost').searchParams;
      expect(consentUrlParams.get('client_id')).toBe(clientForAuthTestsLocal.clientId);
      expect(consentUrlParams.get('scope')).toBe('openid profile');
    });

    it('TC_AM_006_008: 现有同意记录范围不同/更少 -> 重定向到同意页面（模拟认证）/ existing consent for different/fewer scopes -> redirect to consent page (simulated auth)', async () => {
      await prisma.consentGrant.deleteMany({ where: { userId: userForAuthTestsLocal.id, clientId: clientForAuthTestsLocal.id }});
      await dataManager.createConsentGrant(userForAuthTestsLocal.id, clientForAuthTestsLocal.id, ['openid'], addMinutes(new Date(), 30));

      const request = createAuthRequestForSuite({ scope: 'openid profile email' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain('/consent');
      const consentUrlParams = new URL(location!, 'http://localhost').searchParams;
      expect(consentUrlParams.get('scope')).toBe('openid profile email');
    });

    it('TC_AM_006_009: 现有有效同意记录涵盖所有请求范围 -> 直接颁发授权码（模拟认证）/ existing, valid consent covers all scopes -> issue code (simulated auth)', async () => {
      await prisma.consentGrant.deleteMany({ where: { userId: userForAuthTestsLocal.id, clientId: clientForAuthTestsLocal.id }});
      await dataManager.createConsentGrant(userForAuthTestsLocal.id, clientForAuthTestsLocal.id, ['openid', 'profile', 'email'], addMinutes(new Date(), 30));

      const request = createAuthRequestForSuite({ scope: 'openid profile' }); // Requesting subset
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain(clientForAuthTestsLocal.redirectUris[0]);
      const query = parseQuery(location!);
      expect(query.code).toBeDefined();
    });

    it('TC_AM_006_010: 现有同意记录已过期 -> 重定向到同意页面（模拟认证）/ existing consent is expired -> redirect to consent page (simulated auth)', async () => {
      await prisma.consentGrant.deleteMany({ where: { userId: userForAuthTestsLocal.id, clientId: clientForAuthTestsLocal.id }});
      await dataManager.createConsentGrant(userForAuthTestsLocal.id, clientForAuthTestsLocal.id, ['openid', 'profile'], new Date(Date.now() - 1000 * 60 * 60));

      const request = createAuthRequestForSuite({ scope: 'openid profile' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain('/consent');
    });

    it('TC_AM_006_011: prompt=none, 需要同意但未授予 -> 重定向到客户端并带consent_required错误（模拟认证）/ prompt=none, consent required but not granted -> redirect to client with consent_required error (simulated auth)', async () => {
      await prisma.consentGrant.deleteMany({ where: { userId: userForAuthTestsLocal.id, clientId: clientForAuthTestsLocal.id }});
      const request = createAuthRequestForSuite({ prompt: 'none', scope: 'openid profile' });
      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain(clientForAuthTestsLocal.redirectUris[0]);
      const query = parseQuery(location!);
      expect(['consent_required', 'interaction_required']).toContain(query.error); // interaction_required is also possible
      expect(query.state).toBeDefined();
    });
  });

  describe('成功授权码颁发（模拟认证与同意）/ Successful Authorization Code Issuance (Simulated Auth & Consent)', () => {
    it('TC_AM_006_012: 应在DB中记录正确的授权码详情并颁发授权码 / Should issue authorization code with correct details in DB', async () => {
      const successClient = await dataManager.createClient({
        ...clientForAuthTestsLocal,
        clientId: 'success-code-client-' + Date.now(),
        requireConsent: false, // Assume consent is handled or not required
      });
      const state = 'success-state-' + Date.now();
      const nonce = 'success-nonce-' + Date.now();
      const scope = 'openid profile email';

      const request = createAuthRequestForSuite({
        client_id: successClient.clientId,
        scope: scope,
        state: state,
        nonce: nonce,
      });

      const response = await authorizeGET(request);

      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('Location');
      expect(location).toContain(successClient.redirectUris[0]);
      const query = parseQuery(location!);
      expect(query.code).toBeDefined();
      expect(query.state).toBe(state);

      const dbAuthCode = await prisma.authorizationCode.findFirst({
        where: { clientId: successClient.id, state: state }, // Client ID here is the UUID from DB
        orderBy: { createdAt: 'desc' },
      });
      expect(dbAuthCode).not.toBeNull();
      // This assumes userForAuthTestsLocal.id is available from a (simulated) authenticated session
      expect(dbAuthCode!.userId).toBe(userForAuthTestsLocal.id);
      expect(dbAuthCode!.scope).toBe(scope);
      expect(dbAuthCode!.redirectUri).toBe(successClient.redirectUris[0]);
      expect(dbAuthCode!.codeChallenge).toBe(pkceChallengeLocal.codeChallenge);
      expect(dbAuthCode!.codeChallengeMethod).toBe(pkceChallengeLocal.codeChallengeMethod);
      expect(dbAuthCode!.nonce).toBe(nonce);
    });
  });
});
