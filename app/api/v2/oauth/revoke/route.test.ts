// app/api/v2/oauth/revoke/route.test.ts
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
import { ClientType, AuthorizationCode, RefreshToken, User, AccessToken } from '@prisma/client';
import * as jose from 'jose';
import { addMinutes, addDays, subDays } from 'date-fns';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('revoke-endpoint');

// Helper to create FormData
function createFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const key in data) {
    fd.append(key, data[key]);
  }
  return fd;
}

describe('/api/v2/oauth/revoke Endpoint', () => {
  let confidentialClient: TestClient;
  let publicClient: TestClient;
  let testUser: TestUser;

  let userAccessToken: string; // Raw token string
  let userRefreshToken: string; // Raw token string
  let userRefreshTokenRecord: RefreshToken; // DB record

  beforeAll(async () => {
    await setup();
    testUser = await dataManager.createUser(TEST_USERS.REGULAR);
    confidentialClient = await dataManager.createClient({
      clientId: 'revoke-test-conf-client',
      clientName: 'Revoke Test Confidential Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'revokeSecret123!',
      redirectUris: ['https://client.example.com/cb'],
      allowedScopes: ['openid', 'profile', 'offline_access', 'api:read'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
    });
    publicClient = await dataManager.createClient({
      clientId: 'revoke-test-pub-client',
      clientName: 'Revoke Test Public Client',
      clientType: ClientType.PUBLIC,
      redirectUris: ['https://pub-client.example.com/cb'],
      allowedScopes: ['openid', 'profile', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      requirePkce: true,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up tokens and blacklist before each test
    await prisma.accessToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.tokenBlacklist.deleteMany({});

    // Create fresh tokens for the confidential client and testUser
    userAccessToken = await JWTUtils.createAccessToken({
      userId: testUser.id!,
      clientId: confidentialClient.clientId, // String clientId for JWT claim
      scope: 'openid profile api:read',
      permissions: []
    });
    await prisma.accessToken.create({
        data: {
            tokenHash: JWTUtils.getTokenHash(userAccessToken),
            userId: testUser.id!,
            clientId: confidentialClient.id!, // Prisma CUID id
            scope: 'openid profile api:read',
            expiresAt: addMinutes(new Date(), 60)
        }
    });

    userRefreshToken = await JWTUtils.createRefreshToken({
      userId: testUser.id!,
      clientId: confidentialClient.clientId,
      scope: 'openid profile offline_access api:read',
    });
    userRefreshTokenRecord = await prisma.refreshToken.create({
        data: {
            tokenHash: JWTUtils.getTokenHash(userRefreshToken),
            userId: testUser.id!,
            clientId: confidentialClient.id!, // Prisma CUID id
            scope: 'openid profile offline_access api:read',
            expiresAt: addDays(new Date(), 30),
            isRevoked: false,
        }
    });
  });

  const getAuthHeader = (client: TestClient) => `Basic ${Buffer.from(`${client.clientId}:${client.plainSecret}`).toString('base64')}`;

  it('should successfully revoke an access token (confidential client)', async () => {
    const formData = createFormData({
      token: userAccessToken,
      token_type_hint: 'access_token',
    });
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: getAuthHeader(confidentialClient) },
      body: formData,
    });
    expect(response.status).toBe(200);

    const decodedToken = jose.decodeJwt(userAccessToken);
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: decodedToken.jti! }});
    expect(blacklisted).toBeDefined();
    expect(blacklisted?.tokenType).toBe('access_token');
  });

  it('should successfully revoke a refresh token and associated access tokens (confidential client)', async () => {
    // Create an access token that would be associated (same user, client)
    const associatedAccessToken = await JWTUtils.createAccessToken({userId: testUser.id!, clientId: confidentialClient.clientId, scope: 'openid profile'});
    const associatedAccessTokenDb = await prisma.accessToken.create({
        data: {
            tokenHash: JWTUtils.getTokenHash(associatedAccessToken),
            userId: testUser.id!, clientId: confidentialClient.id!, scope: 'openid profile', expiresAt: addMinutes(new Date(), 30)
        }
    });

    const formData = createFormData({
      token: userRefreshToken,
      token_type_hint: 'refresh_token',
    });
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: getAuthHeader(confidentialClient) },
      body: formData,
    });
    expect(response.status).toBe(200);

    const revokedRt = await prisma.refreshToken.findUnique({ where: { id: userRefreshTokenRecord.id }});
    expect(revokedRt?.isRevoked).toBe(true);

    const decodedRefreshToken = jose.decodeJwt(userRefreshToken);
    const blacklistedRt = await prisma.tokenBlacklist.findUnique({ where: { jti: decodedRefreshToken.jti! }});
    expect(blacklistedRt).toBeDefined();

    // Check if associated access token was blacklisted
    const decodedAssociatedAt = jose.decodeJwt(associatedAccessToken);
    const blacklistedAt = await prisma.tokenBlacklist.findUnique({ where: { jti: decodedAssociatedAt.jti! }});
    expect(blacklistedAt).toBeDefined();
  });

  it('should return 200 OK for an invalid token (confidential client)', async () => {
    const formData = createFormData({ token: 'invalid-token-string' });
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: getAuthHeader(confidentialClient) },
      body: formData,
    });
    expect(response.status).toBe(200);
  });

  it('should return 200 OK if token belongs to another client (confidential client)', async () => {
    // Token issued to publicClient, but confidentialClient tries to revoke it
    const otherClientToken = await JWTUtils.createAccessToken({userId: testUser.id!, clientId: publicClient.clientId});
    // Store it as if it's a valid token for publicClient
    await prisma.accessToken.create({
        data: {tokenHash: JWTUtils.getTokenHash(otherClientToken), userId: testUser.id!, clientId: publicClient.id!, scope: 'openid', expiresAt: addMinutes(new Date(), 10)}
    });

    const formData = createFormData({ token: otherClientToken });
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: getAuthHeader(confidentialClient) }, // confidentialClient is revoking
      body: formData,
    });
    expect(response.status).toBe(200); // Server doesn't leak info, but token for publicClient is not revoked by confidentialClient

    const decodedToken = jose.decodeJwt(otherClientToken);
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: decodedToken.jti! }});
    expect(blacklisted).toBeNull(); // Should not be blacklisted by the wrong client
  });

  it('should allow public client to revoke its own token (no client secret)', async () => {
    const publicClientToken = await JWTUtils.createAccessToken({userId: testUser.id!, clientId: publicClient.clientId});
    await prisma.accessToken.create({
        data: {tokenHash: JWTUtils.getTokenHash(publicClientToken), userId: testUser.id!, clientId: publicClient.id!, scope: 'openid', expiresAt: addMinutes(new Date(), 10)}
    });

    const formData = createFormData({
      token: publicClientToken,
      client_id: publicClient.clientId, // Public client identifies itself with client_id
    });
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      body: formData,
    });
    expect(response.status).toBe(200);
    const decodedToken = jose.decodeJwt(publicClientToken);
    const blacklisted = await prisma.tokenBlacklist.findUnique({ where: { jti: decodedToken.jti! }});
    expect(blacklisted).toBeDefined();
  });

  it('should return 400 if token parameter is missing', async () => {
    const formData = createFormData({ token_type_hint: 'access_token' }); // Missing token
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: getAuthHeader(confidentialClient) },
      body: formData,
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
  });

  it('should return 401 if confidential client authentication fails', async () => {
    const formData = createFormData({ token: userAccessToken });
    const badAuthHeader = `Basic ${Buffer.from(`${confidentialClient.clientId}:wrongSecret`).toString('base64')}`;
    const response = await httpClient.makeRequest('/api/v2/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: badAuthHeader },
      body: formData,
    });
    expect(response.status).toBe(401);
  });

});
