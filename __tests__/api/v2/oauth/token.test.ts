import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST as tokenHandler } from 'oauth-service/app/api/v2/oauth/token/route'; // Adjust path as necessary
import { prisma } from '@repo/database/client';
import { createTestClient, createTestUser, cleanupTestData, initializeTestData, createTestRequest } from '../../../setup/test-helpers'; // Adjust path
import { OAuthClient, User, AuthorizationCode } from '@prisma/client';
import { JWTUtils, ScopeUtils } from 'oauth-service/src/lib/auth/oauth2';
import { generateCodeVerifier, generateCodeChallenge } from '@repo/lib/auth';


describe('/api/v2/oauth/token', () => {
  let testClient: OAuthClient;
  let testUser: User;
  let validAuthCode: AuthorizationCode;
  let pkceVerifier: string;
  let pkceChallenge: string;

  beforeAll(async () => {
    await initializeTestData();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await initializeTestData();

    testClient = await createTestClient({
      id: 'token-test-client-cuid',
      clientId: 'token-test-client-id',
      clientSecret: 'token-test-client-secret', // Confidential client
      name: 'Token Test Client App',
      redirectUris: ['https://client.example.com/token-callback'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read', 'api:write'],
    });

    testUser = await createTestUser({
      id: 'token-test-user-cuid',
      username: 'tokenuser',
      isActive: true,
    });

    // Generate PKCE pair for tests
    pkceVerifier = generateCodeVerifier();
    pkceChallenge = await generateCodeChallenge(pkceVerifier);

    // Create a valid authorization code for the authorization_code grant tests
    validAuthCode = await prisma.authorizationCode.create({
      data: {
        code: 'valid_auth_code_for_token_test',
        userId: testUser.id,
        clientId: testClient.id,
        redirectUri: testClient.redirectUris[0],
        scope: JSON.stringify(['openid', 'profile', 'api:read']),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
        codeChallenge: pkceChallenge,
        codeChallengeMethod: 'S256',
        nonce: 'testnonce123',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('POST (Authorization Code Grant)', () => {
    it('should return tokens for a valid authorization_code request with PKCE', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', validAuthCode.code);
      formData.append('redirect_uri', testClient.redirectUris[0]);
      formData.append('client_id', testClient.clientId); // Required by schema, even if client is authed via header
      formData.append('code_verifier', pkceVerifier);

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Simulate HTTP Basic Auth for client authentication
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.access_token).toBeDefined();
      expect(json.token_type).toBe('Bearer');
      expect(json.expires_in).toBeGreaterThan(0);
      expect(json.refresh_token).toBeDefined();
      expect(json.scope).toBe(ScopeUtils.formatScopes(['openid', 'profile', 'api:read']));
      expect(json.id_token).toBeDefined(); // Because 'openid' scope and nonce was present

      // Verify id_token (basic checks)
      const idTokenPayload = await JWTUtils.decodeTokenPayload(json.id_token, testClient.clientSecret || process.env.ID_TOKEN_SECRET || ""); // Assuming symmetric for now or JWKS for asymmetric
      expect(idTokenPayload.iss).toBe(process.env.JWT_ISSUER);
      expect(idTokenPayload.sub).toBe(testUser.id);
      expect(idTokenPayload.aud).toBe(testClient.clientId);
      expect(idTokenPayload.nonce).toBe('testnonce123');

      // Verify that the auth code is marked as used
      const usedCode = await prisma.authorizationCode.findUnique({ where: { id: validAuthCode.id } });
      expect(usedCode?.isUsed).toBe(true);
    });

    // TODO: Add more test cases for authorization_code grant:
    // 1. Invalid code (not found, expired, already used) // ADDING 'already used' NOW
    // 2. redirect_uri mismatch // ADDING NOW
    // 3. Invalid client_id (if not using HTTP Basic Auth)
    // 4. Missing code_verifier
    // 5. Invalid code_verifier (PKCE check fails) // ADDING NOW
    // 6. Client authentication failure

    it('should return error for already used authorization_code', async () => {
      // Mark the code as used
      await prisma.authorizationCode.update({
        where: { id: validAuthCode.id },
        data: { isUsed: true },
      });

      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', validAuthCode.code);
      formData.append('redirect_uri', testClient.redirectUris[0]);
      formData.append('client_id', testClient.clientId);
      formData.append('code_verifier', pkceVerifier);

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Authorization code has already been used');
    });

    it('should return error for redirect_uri mismatch in authorization_code grant', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', validAuthCode.code);
      formData.append('redirect_uri', 'https://wrong.client.com/callback'); // Mismatched URI
      formData.append('client_id', testClient.clientId);
      formData.append('code_verifier', pkceVerifier);

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant'); // Or 'invalid_request' depending on server logic for redirect_uri check
      expect(json.error_description).toContain('Redirect URI mismatch');
    });

    it('should return error for invalid code_verifier in authorization_code grant', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', validAuthCode.code);
      formData.append('redirect_uri', testClient.redirectUris[0]);
      formData.append('client_id', testClient.clientId);
      formData.append('code_verifier', 'invalid-pkce-verifier-short'); // Invalid verifier

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });
      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant'); // PKCE failure results in invalid_grant
      expect(json.error_description).toContain('Invalid PKCE code_verifier');
    });
  });

  describe('POST (Refresh Token Grant)', () => {
    let validRefreshToken: string;
    let validRefreshTokenEntry: any; // Store the DB entry for validation

    beforeEach(async () => {
      // Create a valid refresh token for these tests
      validRefreshToken = await JWTUtils.createRefreshToken({
        user_id: testUser.id,
        client_id: testClient.clientId,
        scope: ScopeUtils.formatScopes(['openid', 'profile', 'api:read']),
      });
      validRefreshTokenEntry = await prisma.refreshToken.create({
        data: {
          tokenHash: JWTUtils.getTokenHash(validRefreshToken),
          userId: testUser.id,
          clientId: testClient.id,
          scope: ScopeUtils.formatScopes(['openid', 'profile', 'api:read']),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expires in 30 days
          jti: (await JWTUtils.decodeTokenPayload(validRefreshToken, process.env.JWT_REFRESH_TOKEN_SECRET || "")).jti,
        },
      });
    });

    it('should return new tokens for a valid refresh_token request', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', validRefreshToken);
      // formData.append('scope', 'openid api:read'); // Optional: request a subset of original scopes

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.access_token).toBeDefined();
      expect(json.token_type).toBe('Bearer');
      expect(json.expires_in).toBeGreaterThan(0);
      expect(json.refresh_token).toBeDefined(); // Assuming rotation is enabled or a new one is issued
      expect(json.refresh_token).not.toBe(validRefreshToken); // Rotation should issue a new one
      expect(json.scope).toBe(ScopeUtils.formatScopes(['openid', 'profile', 'api:read'])); // Should retain original or requested subset

      // Verify the old refresh token is marked as revoked (if rotation is implemented)
      const oldRefreshToken = await prisma.refreshToken.findUnique({ where: { id: validRefreshTokenEntry.id } });
      expect(oldRefreshToken?.isRevoked).toBe(true);

      // Verify a new refresh token entry exists and points to the old one
      const newRefreshTokenRecord = await prisma.refreshToken.findFirst({
        where: { tokenHash: JWTUtils.getTokenHash(json.refresh_token) }
      });
      expect(newRefreshTokenRecord).not.toBeNull();
      expect(newRefreshTokenRecord?.previousTokenId).toBe(validRefreshTokenEntry.id);

    });

    it('should return error for an invalid (e.g., malformed) refresh_token', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', 'invalid-refresh-token-string');

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      // Error message might vary based on JWT decoding failure
      expect(json.error_description).toContain('Invalid refresh token');
    });

    it('should return error for a revoked (blacklisted JTI) refresh_token', async () => {
      const refreshTokenPayload = await JWTUtils.decodeTokenPayload(validRefreshToken, process.env.JWT_REFRESH_TOKEN_SECRET || "");
      await prisma.tokenBlacklist.create({
        data: {
          jti: refreshTokenPayload.jti!,
          tokenType: 'refresh_token',
          expiresAt: new Date(Date.now() + 3600 * 1000), // Example expiry
        }
      });

      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('refresh_token', validRefreshToken);

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Token has been revoked');
    });
  });

  describe('POST (Client Credentials Grant)', () => {
    it('should return access_token for a valid client_credentials request by a confidential client', async () => {
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('scope', 'api:read api:write'); // Request scopes allowed for the client

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${testClient.clientId}:${testClient.clientSecret}`).toString('base64')}`,
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.access_token).toBeDefined();
      expect(json.token_type).toBe('Bearer');
      expect(json.expires_in).toBeGreaterThan(0);
      expect(json.refresh_token).toBeUndefined(); // Client credentials grant typically does not return a refresh token
      expect(json.scope).toContain('api:read');
      expect(json.scope).toContain('api:write');

      // Verify access_token structure (basic check)
      const accessTokenPayload = await JWTUtils.decodeTokenPayload(json.access_token, process.env.JWT_ACCESS_TOKEN_SECRET || "");
      expect(accessTokenPayload.iss).toBe(process.env.JWT_ISSUER);
      expect(accessTokenPayload.sub).toBe(testClient.clientId); // Subject is the client_id
      expect(accessTokenPayload.client_id).toBe(testClient.clientId);
    });

    it('should return error if a public client attempts client_credentials grant', async () => {
      // Create a public client for this test
      const publicClient = await createTestClient({
        id: 'public-client-cuid',
        clientId: 'public-client-id',
        // No clientSecret for public client
        name: 'Public Test Client',
        redirectUris: ['https://public-client.com/cb'],
        grantTypes: ['authorization_code'], // Typically public clients use auth code
        responseTypes: ['code'],
        allowedScopes: ['openid'],
      });
      // Update it to be public and auth method none
      await prisma.oAuthClient.update({
          where: {id: publicClient.id},
          data: { clientType: 'PUBLIC', tokenEndpointAuthMethod: 'none'}
      })


      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', publicClient.clientId); // Public client might send client_id in body

      const req = createTestRequest('/api/v2/oauth/token', {
        method: 'POST',
        body: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // No Authorization header for public client using 'none' auth method for token endpoint
        },
      });

      const response = await tokenHandler(req as NextRequest);
      expect(response.status).toBe(401); // Or 400 depending on how ClientAuthUtils handles public client + client_credentials
      const json = await response.json();
      expect(json.error).toBe('unauthorized_client');
      expect(json.error_description).toContain('Public clients are not permitted to use the client_credentials grant type');
    });
  });
});
