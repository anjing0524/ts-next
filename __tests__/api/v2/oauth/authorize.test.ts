import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET as authorizeHandler } from '@/app/api/v2/oauth/authorize/route'; // Adjust path as necessary
import { prisma } from '@/lib/prisma';
import { createTestClient, createTestUser, cleanupTestData, initializeTestData, createTestRequest, createTestAuthCenterSessionToken } from '../../../setup/test-helpers'; // Adjust path
import { OAuthClient, User } from '@prisma/client';

describe('/api/v2/oauth/authorize', () => {
  let testClient: OAuthClient;
  let testUser: User;

  beforeAll(async () => {
    await initializeTestData();
  });

  beforeEach(async () => {
    await cleanupTestData(); // Clean up before each test to ensure isolation
    await initializeTestData(); // Re-initialize common test data like permissions/roles

    const rawTestClient = await createTestClient({
      id: 'test-client-cuid',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      name: 'Test Client Application',
      redirectUris: ['https://client.example.com/callback', 'https://another.client.com/cb'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read'],
    });
    // Manually parse JSON string fields back to arrays for use in tests
    testClient = {
        ...rawTestClient,
        redirectUris: JSON.parse(rawTestClient.redirectUris as string),
        allowedScopes: JSON.parse(rawTestClient.allowedScopes as string),
        grantTypes: JSON.parse(rawTestClient.grantTypes as string),
        responseTypes: JSON.parse(rawTestClient.responseTypes as string),
    };

    testUser = await createTestUser({
      id: 'test-user-cuid',
      username: 'testuser',
      isActive: true,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('GET', () => {
    it('should redirect to login if user is not authenticated with Auth Center', async () => {
      const queryParams = {
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0],
        response_type: 'code',
        scope: 'openid profile',
        state: 'randomstate123',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', // Valid PKCE challenge
        code_challenge_method: 'S256',
      };
      const req = createTestRequest('/api/v2/oauth/authorize', { query: queryParams });

      const response = await authorizeHandler(req as NextRequest);
      expect(response.status).toBe(302); // Redirect

      const locationHeader = response.headers.get('Location');
      expect(locationHeader).not.toBeNull();

      const redirectUrl = new URL(locationHeader!);
      expect(redirectUrl.pathname).toBe('/login'); // Or process.env.AUTH_CENTER_LOGIN_PAGE_URL
      expect(redirectUrl.searchParams.get('client_id')).toBe(process.env.AUTH_CENTER_UI_CLIENT_ID || 'auth-center-admin-client');
      expect(redirectUrl.searchParams.get('redirect_uri')).toContain('/api/v2/oauth/authorize'); // Should redirect back to authorize
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
      expect(redirectUrl.searchParams.get('scope')).toContain('auth-center:interact');
      expect(redirectUrl.searchParams.get('state_passthrough')).toBe('randomstate123');
    });

    it('should redirect to consent page if user is authenticated but no prior consent', async () => {
      const sessionToken = await createTestAuthCenterSessionToken(testUser.id);
      const queryParams = {
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0],
        response_type: 'code',
        scope: 'openid profile api:read',
        state: 'consentstate456',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      };
      const req = createTestRequest('/api/v2/oauth/authorize', {
        query: queryParams,
        headers: {
          Cookie: `auth_center_session_token=${sessionToken}`,
        },
      });

      // Ensure no consent exists
      await prisma.consentGrant.deleteMany({
        where: { userId: testUser.id, clientId: testClient.id },
      });

      const response = await authorizeHandler(req as NextRequest);
      expect(response.status).toBe(302);

      const locationHeader = response.headers.get('Location');
      expect(locationHeader).not.toBeNull();
      const redirectUrl = new URL(locationHeader!);

      expect(redirectUrl.pathname).toBe('/api/v2/oauth/consent');
      expect(redirectUrl.searchParams.get('client_id')).toBe(testClient.clientId);
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(testClient.redirectUris[0]);
      expect(redirectUrl.searchParams.get('scope')).toBe('openid profile api:read');
      expect(redirectUrl.searchParams.get('state')).toBe('consentstate456');
      expect(redirectUrl.searchParams.get('code_challenge')).toBe(queryParams.code_challenge);
    });

    it('should redirect to client with code if user is authenticated and consent exists', async () => {
      const sessionToken = await createTestAuthCenterSessionToken(testUser.id);
      const requestedScopes = 'openid profile api:read';
      const queryParams = {
        client_id: testClient.clientId,
        redirect_uri: testClient.redirectUris[0],
        response_type: 'code',
        scope: requestedScopes,
        state: 'authedandconsented789',
        code_challenge: 'PKCEChallengeForConsentedFlow',
        code_challenge_method: 'S256',
        nonce: 'oidcnonce123',
      };
      const req = createTestRequest('/api/v2/oauth/authorize', {
        query: queryParams,
        headers: {
          Cookie: `auth_center_session_token=${sessionToken}`,
        },
      });

      // Create prior consent
      await prisma.consentGrant.create({
        data: {
          userId: testUser.id,
          clientId: testClient.id,
          scopes: requestedScopes, // Exact match
        },
      });

      const response = await authorizeHandler(req as NextRequest);
      expect(response.status).toBe(302);

      const locationHeader = response.headers.get('Location');
      expect(locationHeader).not.toBeNull();
      const redirectUrl = new URL(locationHeader!);

      expect(redirectUrl.origin).toBe(new URL(testClient.redirectUris[0]).origin);
      expect(redirectUrl.pathname).toBe(new URL(testClient.redirectUris[0]).pathname);
      expect(redirectUrl.searchParams.get('code')).toBeDefined();
      expect(redirectUrl.searchParams.get('state')).toBe('authedandconsented789');

      // Verify that an authorization code was stored
      const authCodeEntry = await prisma.authorizationCode.findFirst({
        where: {
          userId: testUser.id,
          clientId: testClient.id,
          codeChallenge: queryParams.code_challenge,
          nonce: queryParams.nonce,
        },
      });
      expect(authCodeEntry).not.toBeNull();
      expect(authCodeEntry?.code).toBe(redirectUrl.searchParams.get('code'));
      expect(authCodeEntry?.scope).toBe(requestedScopes);
    });

    // TODO: Add more test cases:
    // 1. User authenticated with Auth Center, no prior consent -> redirect to consent page // DONE
    // 2. User authenticated, prior consent exists for requested scopes -> redirect to client with code // DONE
    // 3. Invalid client_id // ADDING NOW
    // 4. redirect_uri mismatch // ADDING NOW
    // 5. Missing required parameters (e.g., scope, code_challenge if PKCE required)
    // 6. PKCE method not S256
    // 7. Invalid scope requested
    // 8. OIDC nonce handling

    it('should return error for invalid client_id', async () => {
      const queryParams = {
        client_id: 'invalid-client-id',
        redirect_uri: 'https://client.example.com/callback', // A valid URI, but client is not
        response_type: 'code',
        scope: 'openid',
        state: 'state789',
        code_challenge: 'SomeChallenge',
        code_challenge_method: 'S256',
      };
      const req = createTestRequest('/api/v2/oauth/authorize', { query: queryParams });
      const response = await authorizeHandler(req as NextRequest);

      expect(response.status).toBe(400); // Bad Request for invalid client
      const json = await response.json();
      expect(json.error).toBe('invalid_client'); // Or as defined in OAuth2ErrorCode
      expect(json.error_description).toContain('Client not found or not active');
    });

    it('should return error for redirect_uri mismatch', async () => {
      const queryParams = {
        client_id: testClient.clientId,
        redirect_uri: 'https://attacker.example.com/callback', // Mismatched URI
        response_type: 'code',
        scope: 'openid',
        state: 'state101',
        code_challenge: 'AnotherChallenge',
        code_challenge_method: 'S256',
      };
      const req = createTestRequest('/api/v2/oauth/authorize', { query: queryParams });
      const response = await authorizeHandler(req as NextRequest);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request'); // As per spec, redirect_uri mismatch is invalid_request
      expect(json.error_description).toContain('Invalid redirect_uri');
    });

    it('should return error if PKCE is required by client but code_challenge is missing', async () => {
        // Ensure client requires PKCE
        await prisma.oAuthClient.update({
            where: { id: testClient.id },
            data: { requirePkce: true }
        });

        const queryParams = {
            client_id: testClient.clientId,
            redirect_uri: testClient.redirectUris[0],
            response_type: 'code',
            scope: 'openid',
            state: 'pkceMissingState',
            // code_challenge is missing
            code_challenge_method: 'S256',
        };
        const req = createTestRequest('/api/v2/oauth/authorize', { query: queryParams });
        const response = await authorizeHandler(req as NextRequest);

        // The handler redirects with error to the client's redirect_uri if redirect_uri is valid
        // and the error is related to request parameters like missing PKCE.
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get('Location') || '');
        expect(location.searchParams.get('error')).toBe('invalid_request');
        expect(location.searchParams.get('error_description')).toContain('PKCE (code_challenge and code_challenge_method) is required');
    });
  });
});
