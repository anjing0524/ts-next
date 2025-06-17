// app/api/v2/oauth/userinfo/route.test.ts
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
import { JWTUtils } from '@/lib/auth/oauth2'; // For creating tokens
import { ClientType, User } from '@prisma/client';
import * as jose from 'jose'; // For decoding in tests

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('userinfo-endpoint');

describe('/api/v2/oauth/userinfo Endpoint', () => {
  let testClient: TestClient;
  let testUser: TestUser;
  let userAccessTokenWithOpenId: string;
  let userAccessTokenNoOpenId: string;
  let clientCredAccessToken: string;
  let expiredAccessToken: string;
  let revokedAccessToken: string;
  let revokedAccessTokenJti: string | undefined;


  beforeAll(async () => {
    await setup();
    testUser = await dataManager.createUser(TEST_USERS.REGULAR);
    testClient = await dataManager.createClient({
      clientId: 'userinfo-test-client',
      clientName: 'UserInfo Test Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'userinfoSecret123!',
      redirectUris: ['https://client.example.com/cb'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read', 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
    });

    // Valid token with openid, profile, email scopes
    userAccessTokenWithOpenId = await JWTUtils.createAccessToken({
      userId: testUser.id!,
      clientId: testClient.clientId,
      scope: 'openid profile email api:read',
      permissions: ['api:read']
    });
    await prisma.accessToken.create({
        data: { tokenHash: JWTUtils.getTokenHash(userAccessTokenWithOpenId), userId: testUser.id!, clientId: testClient.id!, scope: 'openid profile email api:read', expiresAt: addMinutes(new Date(), 60)}
    });

    // Valid token without openid scope
    userAccessTokenNoOpenId = await JWTUtils.createAccessToken({
      userId: testUser.id!,
      clientId: testClient.clientId,
      scope: 'profile email api:read',
      permissions: ['api:read']
    });
     await prisma.accessToken.create({
        data: { tokenHash: JWTUtils.getTokenHash(userAccessTokenNoOpenId), userId: testUser.id!, clientId: testClient.id!, scope: 'profile email api:read', expiresAt: addMinutes(new Date(), 60)}
    });

    // Client credentials token (no user context)
    clientCredAccessToken = await JWTUtils.createAccessToken({
      clientId: testClient.clientId,
      scope: 'api:read',
    });
    await prisma.accessToken.create({
        data: { tokenHash: JWTUtils.getTokenHash(clientCredAccessToken), clientId: testClient.id!, scope: 'api:read', expiresAt: addMinutes(new Date(), 60)}
    });

    // Expired token
    expiredAccessToken = await JWTUtils.createAccessToken({
      userId: testUser.id!,
      clientId: testClient.clientId,
      scope: 'openid profile',
      exp: '-1m' // expired 1 minute ago
    });
     // No need to store expired token in DB for this test, as JWTUtils.verifyAccessToken checks expiry first

    // Revoked token
    revokedAccessToken = await JWTUtils.createAccessToken({
      userId: testUser.id!,
      clientId: testClient.clientId,
      scope: 'openid profile',
    });
    const decodedRevoked = jose.decodeJwt(revokedAccessToken);
    revokedAccessTokenJti = decodedRevoked.jti;
    await prisma.accessToken.create({ // Store it so it's found initially
        data: { tokenHash: JWTUtils.getTokenHash(revokedAccessToken), userId: testUser.id!, clientId: testClient.id!, scope: 'openid profile', expiresAt: addMinutes(new Date(), 60)}
    });
    if (revokedAccessTokenJti) {
      await prisma.tokenBlacklist.create({
        data: { jti: revokedAccessTokenJti, tokenType: 'access_token', expiresAt: addMinutes(new Date(), 60) }
      });
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should return user information for a valid access token with openid scope (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', userAccessTokenWithOpenId);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const userInfo = await response.json();

    expect(userInfo.sub).toBe(testUser.id);
    expect(userInfo.name).toBe(`${testUser.firstName} ${testUser.lastName}`);
    expect(userInfo.given_name).toBe(testUser.firstName);
    expect(userInfo.family_name).toBe(testUser.lastName);
    expect(userInfo.email).toBe(testUser.email);
    expect(userInfo.preferred_username).toBe(testUser.username);
    // email_verified might not be on TestUser, UserInfo endpoint defaults it to false if not on model
    expect(userInfo.email_verified).toBe(testUser.emailVerified === undefined ? false : testUser.emailVerified);
  });

  it('should return 401 for an expired access token', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', expiredAccessToken);
    expect(response.status).toBe(401);
    const error = await response.json();
    expect(error.error).toBe('INVALID_TOKEN');
    expect(error.error_description).toContain('expired');
  });

  it('should return 401 for a revoked access token (JTI in blacklist)', async () => {
    expect(revokedAccessTokenJti).toBeDefined(); // Ensure JTI was captured
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', revokedAccessToken);
    expect(response.status).toBe(401);
    const error = await response.json();
    expect(error.error).toBe('INVALID_TOKEN');
    expect(error.error_description).toContain('revoked');
  });

  it('should return 403 if access token does not have "openid" scope', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', userAccessTokenNoOpenId);
    expect(response.status).toBe(403);
    const error = await response.json();
    expect(error.error).toBe('insufficient_scope');
  });

  it('should return 401 if access token is from client_credentials grant (no user context)', async () => {
    // The UserInfo endpoint expects a token that represents a user.
    // A client_credentials token represents a client.
    // The check `if (!dbAccessToken.user)` or `if(!userId)` inside userinfo route should catch this.
    // Or, the JWT 'sub' for client_credentials might be the client_id, leading to user not found.
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', clientCredAccessToken);
    expect(response.status).toBe(401); // Or 404 if user lookup fails based on client_id as sub
    const error = await response.json();
    expect(error.error).toBe('INVALID_TOKEN'); // Or NOT_FOUND
    // The exact error might depend on how sub is processed for client_credentials tokens if they reach this point.
    // Ideally, client_credentials tokens shouldn't have 'openid' scope anyway.
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/oauth/userinfo');
    expect(response.status).toBe(401);
  });

  it('should return 401 for a malformed access token', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/oauth/userinfo', "this.is.not.a.jwt");
    expect(response.status).toBe(401);
  });

});
