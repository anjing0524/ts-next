// app/api/v2/oauth/token/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  createOAuth2TestSetup,
  TestDataManager,
  TEST_USERS,
  TestClient,
  TestUser
} from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { JWTUtils, PKCEUtils, ScopeUtils } from '@/lib/auth/oauth2';
import { ClientType, AuthorizationCode, RefreshToken, User } from '@prisma/client';
import * as jose from 'jose';
import { addMinutes, addDays, subDays } from 'date-fns';


const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('token-endpoint');

// Helper to create FormData
function createFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const key in data) {
    fd.append(key, data[key]);
  }
  return fd;
}

describe('/api/v2/oauth/token Endpoint', () => {
  let confidentialClient: TestClient;
  let publicClient: TestClient;
  let testUser: TestUser;
  let authCodeRecord: AuthorizationCode;
  let pkce: { codeVerifier: string; codeChallenge: string; codeChallengeMethod: 'S256' };

  const MOCK_ISSUER_FOR_TOKEN_TESTS = process.env.JWT_ISSUER!;
  const MOCK_AUDIENCE_FOR_TOKEN_TESTS = process.env.JWT_AUDIENCE!;


  beforeAll(async () => {
    await setup();
    testUser = await dataManager.createUser(TEST_USERS.REGULAR);
    confidentialClient = await dataManager.createClient({
      clientId: 'token-test-conf-client',
      clientName: 'Token Test Confidential Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'veryStrongSecret123!',
      redirectUris: ['https://client.example.com/cb', 'http://localhost:3002/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read', 'api:write', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
    });
    publicClient = await dataManager.createClient({
      clientId: 'token-test-pub-client',
      clientName: 'Token Test Public Client',
      clientType: ClientType.PUBLIC,
      redirectUris: ['https://pub-client.example.com/cb'],
      allowedScopes: ['openid', 'profile', 'api:read', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      requirePkce: true,
    });
    pkce = PKCEUtils.generatePKCE();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up codes and tokens before each test
    await prisma.authorizationCode.deleteMany({});
    await prisma.accessToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.idToken.deleteMany({}); // Assuming an IdToken table if you store them

    // Create a fresh auth code for relevant tests
    const code = AuthorizationUtils.generateAuthorizationCode();
    authCodeRecord = await prisma.authorizationCode.create({
      data: {
        code,
        userId: testUser.id!,
        clientId: confidentialClient.id!, // Prisma CUID id
        redirectUri: confidentialClient.redirectUris[0],
        scope: 'openid profile email offline_access',
        expiresAt: addMinutes(new Date(), 10),
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
        nonce: 'test-nonce-for-id-token',
      }
    });
  });

  describe('Authorization Code Grant', () => {
    it('should exchange authorization code for tokens successfully for confidential client (Basic Auth)', async () => {
      const formData = createFormData({
        grant_type: 'authorization_code',
        code: authCodeRecord.code,
        redirect_uri: authCodeRecord.redirectUri,
        code_verifier: pkce.codeVerifier,
        // client_id is not needed in body if using Basic Auth
      });

      const authHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`;

      const response = await httpClient.makeRequest('/api/v2/oauth/token', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });

      expect(response.status).toBe(200);
      const tokens = await response.json();

      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBe(confidentialClient.accessTokenLifetime || 3600);
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.id_token).toBeDefined(); // Because 'openid' scope was requested
      expect(tokens.scope).toBe(authCodeRecord.scope);

      // Verify ID token
      const { payload: idTokenPayload } = await jose.jwtVerify(
        tokens.id_token,
        await jose.importSPKI(process.env.JWT_PUBLIC_KEY_PEM!, process.env.JWT_ALGORITHM!),
        { issuer: MOCK_ISSUER_FOR_TOKEN_TESTS, audience: confidentialClient.clientId }
      );
      expect(idTokenPayload.nonce).toBe('test-nonce-for-id-token');
      expect(idTokenPayload.sub).toBe(testUser.id);

      // Verify code is used
      const usedCode = await prisma.authorizationCode.findUnique({ where: { code: authCodeRecord.code }});
      expect(usedCode?.isUsed).toBe(true);
    });

    it('should exchange authorization code for tokens successfully for public client (client_id in body)', async () => {
      const publicAuthCode = await prisma.authorizationCode.create({
        data: {
            code: AuthorizationUtils.generateAuthorizationCode(),
            userId: testUser.id!,
            clientId: publicClient.id!, // Prisma CUID id
            redirectUri: publicClient.redirectUris[0],
            scope: 'openid profile',
            expiresAt: addMinutes(new Date(), 10),
            codeChallenge: pkce.codeChallenge,
            codeChallengeMethod: pkce.codeChallengeMethod,
            nonce: 'public-client-nonce',
        }
      });

      const formData = createFormData({
        grant_type: 'authorization_code',
        code: publicAuthCode.code,
        redirect_uri: publicAuthCode.redirectUri,
        code_verifier: pkce.codeVerifier,
        client_id: publicClient.clientId, // Public clients send client_id in body
      });

      const response = await httpClient.makeRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
      });

      expect(response.status).toBe(200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.id_token).toBeDefined();
    });


    it('should fail if PKCE code_verifier is invalid', async () => {
      const formData = createFormData({
        grant_type: 'authorization_code',
        code: authCodeRecord.code,
        redirect_uri: authCodeRecord.redirectUri,
        code_verifier: 'invalid-verifier',
        client_id: confidentialClient.clientId, // For confidential client using client_secret_post
        client_secret: confidentialClient.plainSecret!,
      });
      const response = await httpClient.makeRequest('/api/v2/oauth/token', { method: 'POST', body: formData });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toBe(OAuth2ErrorTypes.INVALID_GRANT);
      expect(error.error_description).toContain('PKCE verification failed');
    });

    it('should fail if authorization code is already used', async () => {
        await prisma.authorizationCode.update({where: {id: authCodeRecord.id}, data: {isUsed: true}});
        const formData = createFormData({
            grant_type: 'authorization_code',
            code: authCodeRecord.code,
            redirect_uri: authCodeRecord.redirectUri,
            code_verifier: pkce.codeVerifier,
            client_id: confidentialClient.clientId,
            client_secret: confidentialClient.plainSecret!,
        });
        const response = await httpClient.makeRequest('/api/v2/oauth/token', { method: 'POST', body: formData });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.error_description).toContain('already been used');
    });
  });

  describe('Refresh Token Grant', () => {
    let existingRefreshToken: RefreshToken;

    beforeEach(async () => {
      const rtValue = await JWTUtils.createRefreshToken({userId: testUser.id, clientId: confidentialClient.clientId, scope: 'openid profile offline_access'});
      existingRefreshToken = await prisma.refreshToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(rtValue),
          userId: testUser.id!,
          clientId: confidentialClient.id!,
          scope: 'openid profile offline_access',
          expiresAt: addDays(new Date(), 30),
          // token: rtValue, // Not storing raw token in this test setup for DB
        }
      });
       // For the test to use the actual token string:
      (existingRefreshToken as any).rawTokenValue = rtValue;
    });

    it('should exchange refresh token for new tokens (confidential client, basic auth)', async () => {
      const formData = createFormData({
        grant_type: 'refresh_token',
        refresh_token: (existingRefreshToken as any).rawTokenValue,
        scope: 'openid profile', // Requesting same or subset of scopes
      });
      const authHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`;

      const response = await httpClient.makeRequest('/api/v2/oauth/token', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });

      expect(response.status).toBe(200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined(); // New refresh token due to rotation
      expect(tokens.refresh_token).not.toBe((existingRefreshToken as any).rawTokenValue);
      expect(tokens.id_token).toBeDefined(); // If openid scope present
      expect(tokens.scope).toBe('openid profile');

      const oldRt = await prisma.refreshToken.findUnique({where: {id: existingRefreshToken.id}});
      expect(oldRt?.isRevoked).toBe(true);
      const newRtInDb = await prisma.refreshToken.findFirst({where: {tokenHash: JWTUtils.getTokenHash(tokens.refresh_token)}});
      expect(newRtInDb).toBeDefined();
      expect(newRtInDb?.previousTokenId).toBe(existingRefreshToken.id);
    });

    it('should fail if refresh token is revoked', async () => {
        await prisma.refreshToken.update({where: {id: existingRefreshToken.id}, data: {isRevoked: true}});
        const formData = createFormData({
            grant_type: 'refresh_token',
            refresh_token: (existingRefreshToken as any).rawTokenValue,
        });
         const authHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`;
        const response = await httpClient.makeRequest('/api/v2/oauth/token', { method: 'POST', headers: {Authorization: authHeader}, body: formData });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.error_description).toContain('revoked');
    });
  });

  describe('Client Credentials Grant', () => {
    it('should get an access token for a confidential client', async () => {
      const formData = createFormData({
        grant_type: 'client_credentials',
        scope: 'api:read api:write', // Requesting scopes allowed for the client
      });
      const authHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`;

      const response = await httpClient.makeRequest('/api/v2/oauth/token', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });
      expect(response.status).toBe(200);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.scope).toContain('api:read');
      expect(tokens.scope).toContain('api:write');
      expect(tokens.refresh_token).toBeUndefined();
      expect(tokens.id_token).toBeUndefined();
    });

    it('should fail for a public client attempting client_credentials', async () => {
      const formData = createFormData({
        grant_type: 'client_credentials',
        client_id: publicClient.clientId, // Public client must send client_id in body
      });
      const response = await httpClient.makeRequest('/api/v2/oauth/token', { method: 'POST', body: formData });
      expect(response.status).toBe(401); // Or 400 depending on how ClientAuthUtils handles it.
                                       // The existing token route code seems to return 401 from ClientAuthUtils if secret is missing for non-public.
                                       // Or for public client, the handler itself should throw unauthorized_client.
      const error = await response.json();
      expect(error.error).toBe(OAuth2ErrorTypes.UNAUTHORIZED_CLIENT);
    });
  });

  describe('General Error Handling', () => {
    it('should return error for unsupported grant_type', async () => {
        const formData = createFormData({ grant_type: 'invalid_grant_type' });
        const authHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`;
        const response = await httpClient.makeRequest('/api/v2/oauth/token', { method: 'POST', headers: {Authorization: authHeader}, body: formData });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.error).toBe(OAuth2ErrorTypes.UNSUPPORTED_GRANT_TYPE);
    });
  });
});
