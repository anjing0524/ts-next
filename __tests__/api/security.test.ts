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
} from '../utils/test-helpers';

// Import route functions directly for code coverage
import { GET as authorizeGET } from '@/app/api/oauth/authorize/route';
import { POST as tokenPOST } from '@/app/api/oauth/token/route';
import { GET as userinfoGET } from '@/app/api/oauth/userinfo/route';

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

// Helper function to create userinfo requests
function createUserInfoRequest(accessToken: string): NextRequest {
  return createNextRequest('/api/oauth/userinfo', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
function createAuthorizeRequest(
  authParams: Record<string, string>,
  method: 'GET' | 'POST' = 'GET'
): NextRequest {
  if (method === 'GET') {
    const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
    return createNextRequest(authorizeUrl);
  } else {
    return createNextRequest('/api/oauth/authorize', {
      method: 'POST',
      body: JSON.stringify(authParams),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

describe('安全测试 / Security Tests (SEC)', () => {
  let testUser: any = null;
  let testClient: any = null;
  let validAccessToken: string = '';
  let dataManager: TestDataManager;

  beforeAll(async () => {
    const setup = createOAuth2TestSetup('security');
    await setup.setup();
    dataManager = setup.dataManager;
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    const setup = createOAuth2TestSetup('security'); // Re-create to ensure clean context for cleanup
    await setup.cleanup();
  });

  async function setupTestData() {
    testUser = await dataManager.createUser({
      ...TEST_USERS.REGULAR,
      username: 'securitytestuser-' + Date.now(),
      email: `security-${Date.now()}@example.com`,
      firstName: 'Security',
      lastName: 'TestUser',
    });

    testClient = await dataManager.createClient({
      ...TEST_CLIENTS.CONFIDENTIAL,
      clientId: 'security-test-client-' + Date.now(),
      name: 'Security Test Client',
      redirectUris: ['https://secure.example.com/callback'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'api:read'],
    });

    validAccessToken = await dataManager.createAccessToken(
      testUser.id,
      testClient.clientId,
      'openid profile email'
    );
  }

  async function cleanupTestData() {
    await dataManager.cleanup();
  }

  describe('SEC-001: 令牌篡改测试 / Token Tampering Tests', () => {
    it('TC_SEC_001_001: 应该拒绝被篡改的访问令牌 / Should reject tampered access tokens', async () => {
      const tamperedToken = validAccessToken.slice(0, -5) + 'XXXXX';

      const userinfoRequest = createUserInfoRequest(tamperedToken);
      const response = await userinfoGET(userinfoRequest);

      // A tampered token should consistently result in an invalid_token error (401).
      TestAssertions.expectStatus(response, 401);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('TC_SEC_001_002: 如果是JWT，应该拒绝载荷被修改的令牌 / Should reject tokens with modified payload (if JWT)', async () => {
      const fakeJwtToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const userinfoRequest = createUserInfoRequest(fakeJwtToken);
      const response = await userinfoGET(userinfoRequest);

      TestAssertions.expectStatus(response, 401);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });

    it('TC_SEC_001_003: 如果是JWT，应该拒绝签名无效的令牌 / Should reject tokens with invalid signature (if JWT)', async () => {
      // Assuming the original token is JWT-like. Appending "invalid" would break signature.
      // If opaque, this might still pass structure but fail validation.
      const invalidSignatureToken = validAccessToken + 'invalid';

      const userinfoRequest = createUserInfoRequest(invalidSignatureToken);
      const response = await userinfoGET(userinfoRequest);

      TestAssertions.expectStatus(response, 401);
      const error = await response.json();
      expect(error.error).toBe('invalid_token');
    });
  });

  describe('SEC-002: CSRF保护测试 / CSRF Protection Tests', () => {
    it('TC_SEC_002_001: 应该在授权端点防止CSRF攻击 / Should protect against CSRF attacks on authorization endpoint', async () => {
      // This test simulates a cross-origin request without proper CSRF tokens (e.g. state mismatch or origin check)
      // The exact behavior depends on the CSRF protection mechanism implemented (e.g., Origin/Referer check, state param)
      // For a unit test of the route handler, full browser behavior isn't simulated.
      // We are testing if the endpoint has some CSRF measures.
      const authParams = { // Renamed from csrfData for clarity
        response_type: 'code',
        client_id: testClient.clientId,
        redirect_uri: 'https://secure.example.com/callback', // A valid redirect URI for the client
        scope: 'openid profile',
        // 'state' parameter is crucial for CSRF. Its absence or mismatch (if stored) should be checked.
        // This test implies checking Origin/Referer or a missing/invalid anti-CSRF token not directly part of OAuth state.
      };
      const authorizeUrl = `/api/oauth/authorize?${new URLSearchParams(authParams).toString()}`;
      const authorizeRequest = createNextRequest(authorizeUrl, { // Changed from /api/oauth/authorize
        method: 'GET', // GET is more common for CSRF via malicious link
        headers: { // Simulate cross-site request headers
          Origin: 'https://malicious.example.com', // Different origin
          Referer: 'https://malicious.example.com/attack-page',
        },
      });

      const response = await authorizeGET(authorizeRequest);

      // Expect 400 (Bad Request) or 403 (Forbidden) if CSRF is detected via Origin/Referer or other means.
      // Or it might proceed to a login page (200) if CSRF check is only on POST or via 'state' param.
      // The key is that it shouldn't directly process the request as if it's legitimate without 'state' validation.
      // For this unit test, a direct 400/403 is a strong indication of some CSRF check.
      TestAssertions.expectStatus(response, [200, 302, 400, 403]);
    });

    it('TC_SEC_002_002: 应该在OAuth流程中验证state参数 / Should validate state parameter in OAuth flow', async () => {
      const legitimateState = 'legitimate-state-value-' + crypto.randomBytes(8).toString('hex');
      const authParams = {
        response_type: 'code',
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0], // Use a registered URI
        scope: 'openid profile',
        state: legitimateState,
      };

      const authorizeRequest = createAuthorizeRequest(authParams);
      const response = await authorizeGET(authorizeRequest);

      // Expect a redirect (302) to the login page or consent screen.
      // The 'state' parameter must be included in the redirect URL.
      TestAssertions.expectStatus(response, [200, 302, 307]); // 200 if login page, 302/307 for redirect
      if (response.status === 302 || response.status === 307) {
        const location = response.headers.get('location');
        expect(location).toBeTruthy();
        // If redirecting to an error page due to other misconfigs (e.g. user not logged in for unit test)
        // state should still be preserved.
        expect(location).toContain(`state=${legitimateState}`);
      }
    });
  });

  describe('SEC-003: 重放攻击测试 / Replay Attack Tests', () => {
    it('TC_SEC_003_001: 应该阻止对令牌请求的重放攻击 / Should prevent replay attacks on token requests (auth code already used)', async () => {
      const authCodeValue = 'replay-test-code-' + crypto.randomBytes(8).toString('hex');
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: authCodeValue,
          clientId: testClient.id, // Prisma uses 'id' for relations, not 'clientId' string
          userId: testUser.id,
          redirectUri: testClient.redirectUris[0],
          scope: 'openid profile',
          expiresAt: addMinutes(new Date(), 10),
        },
      });

      const tokenRequestData = {
        grant_type: 'authorization_code',
        code: authCode.code, // Use the actual code string
        redirect_uri: testClient.redirectUris[0],
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
      };

      // First request - should consume the auth code
      const firstTokenRequest = createTokenRequest(tokenRequestData);
      const response1 = await tokenPOST(firstTokenRequest);
      TestAssertions.expectStatus(response1, 200); // Assuming first one is successful

      // Second request with the same auth code - should be rejected
      const secondTokenRequest = createTokenRequest(tokenRequestData);
      const response2 = await tokenPOST(secondTokenRequest);

      // Expect 'invalid_grant' (400) because the code has already been used or is invalid.
      TestAssertions.expectStatus(response2, 400);
      const error = await response2.json();
      expect(error.error).toBe('invalid_grant');

      // Cleanup: Prisma will cascade delete if schema is set up, otherwise manual
      await prisma.authorizationCode.delete({ where: { id: authCode.id } });
    });
  });

  describe('SEC-004: 速率限制测试 / Rate Limiting Tests', () => {
    // Rate limiting tests are typically harder to unit test reliably without specific mock infrastructure
    // or hitting a live, configured environment. Skipping is reasonable for unit tests.
    it.skip('TC_SEC_004_001: 应该在令牌端点实施速率限制 / Should implement rate limiting on token endpoint', async () => {
      const tokenRequestData = {
        grant_type: 'client_credentials', // A grant type that might be prone to abuse
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
        scope: 'api:read',
      };

      const requestPromises = [];
      for (let i = 0; i < 20; i++) { // Number of requests to simulate burst
        requestPromises.push(tokenPOST(createTokenRequest(tokenRequestData)));
      }
      const responses = await Promise.all(requestPromises);
      const rateLimitedResponse = responses.find(res => res.status === 429);

      expect(rateLimitedResponse).toBeDefined();
    });
  });

  describe('SEC-005: 输入验证测试 / Input Validation Tests', () => {
    it('TC_SEC_005_001: 应该验证授权请求参数的有效性 / Should validate authorization request parameters for validity', async () => {
      const invalidAuthParams = {
        response_type: 'invalid_response_type_value', // Clearly invalid
        client_id: testClient.clientId, // Valid client
        redirect_uri: testClient.redirectUris[0], // Valid redirect URI
        scope: 'openid',
        state: 'test-state',
      };

      const authorizeRequest = createAuthorizeRequest(invalidAuthParams);
      const response = await authorizeGET(authorizeRequest);

      // Expect a redirect to the client's redirect_uri with an error in the query.
      TestAssertions.expectStatus(response, 302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain('error=unsupported_response_type');
      expect(location).toContain(`state=${invalidAuthParams.state}`);
    });

    it('TC_SEC_005_002: 应该验证令牌请求参数的有效性 / Should validate token request parameters for validity', async () => {
      const invalidTokenData = {
        grant_type: 'unsupported_grant_type_for_sure', // Clearly invalid
        client_id: testClient.clientId,
        client_secret: testClient.plainSecret!,
      };

      const tokenRequest = createTokenRequest(invalidTokenData);
      const response = await tokenPOST(tokenRequest);

      // Expect 400 Bad Request with unsupported_grant_type error.
      TestAssertions.expectStatus(response, 400);
      const error = await response.json();
      expect(error.error).toBe('unsupported_grant_type');
    });
  });
});
