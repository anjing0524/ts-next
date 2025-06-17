// app/api/v2/account/sessions/[sessionId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, RefreshToken, AccessToken } from '@prisma/client'; // Import Prisma types
import { JWTUtils } from '@/lib/auth/oauth2';
import { addDays, addMinutes } from 'date-fns';
import * as jose from 'jose';


const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('account-session-delete-api');

describe('DELETE /api/v2/account/sessions/{sessionId}', () => {
  let userASessionToken: string; // Token for User A to make API calls
  let userA: TestUser;
  let userB: TestUser; // Another user for testing cross-user access

  let client: TestClient;

  let userARefreshToken1Record: RefreshToken; // User A's session to be deleted
  let userARefreshToken1Value: string;
  let userARefreshToken2Record: RefreshToken; // User A's other session
  let userARefreshToken2Value: string;
  let userBRefreshTokenRecord: RefreshToken; // User B's session
  let userBRefreshTokenValue: string;

  // Access tokens potentially derived from userARefreshToken1
  let userA_AccessToken1_from_RT1: string;
  let userA_AccessToken2_from_RT1: string;


  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'sessiondeluserA', email: 'sessiondelA@example.com' });
    userB = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'sessiondeluserB', email: 'sessiondelB@example.com' });

    client = await dataManager.createClient({
      clientId: 'session-del-client',
      clientName: 'Session Deletion Test Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'sDsecret1',
      redirectUris: ['http://localhost/cbdel'],
      allowedScopes: ['openid', 'offline_access', 'api:read'],
      grantTypes: ['refresh_token', 'authorization_code']
    });

    // Token for User A to authenticate their API requests
    userASessionToken = await dataManager.createAccessToken(userA.id!, client.clientId, 'openid');
  });

  beforeEach(async () => {
    // Clear previous tokens for these users/client to avoid interference
    await prisma.accessToken.deleteMany({where: {userId: userA.id, clientId: client.id}});
    await prisma.refreshToken.deleteMany({where: {userId: userA.id, clientId: client.id}});
    await prisma.accessToken.deleteMany({where: {userId: userB.id, clientId: client.id}});
    await prisma.refreshToken.deleteMany({where: {userId: userB.id, clientId: client.id}});
    await prisma.tokenBlacklist.deleteMany({});


    // Create sessions (Refresh Tokens) for User A
    userARefreshToken1Value = await JWTUtils.createRefreshToken({ userId: userA.id!, clientId: client.clientId, scope: 'openid offline_access api:read' });
    userARefreshToken1Record = await prisma.refreshToken.create({
      data: { userId: userA.id!, clientId: client.id!, tokenHash: JWTUtils.getTokenHash(userARefreshToken1Value), scope: 'openid offline_access api:read', expiresAt: addDays(new Date(), 30) }
    });

    userARefreshToken2Value = await JWTUtils.createRefreshToken({ userId: userA.id!, clientId: client.clientId, scope: 'openid offline_access' });
    userARefreshToken2Record = await prisma.refreshToken.create({
      data: { userId: userA.id!, clientId: client.id!, tokenHash: JWTUtils.getTokenHash(userARefreshToken2Value), scope: 'openid offline_access', expiresAt: addDays(new Date(), 30) }
    });

    // Create a session for User B
    userBRefreshTokenValue = await JWTUtils.createRefreshToken({ userId: userB.id!, clientId: client.clientId, scope: 'openid offline_access' });
    userBRefreshTokenRecord = await prisma.refreshToken.create({
      data: { userId: userB.id!, clientId: client.id!, tokenHash: JWTUtils.getTokenHash(userBRefreshTokenValue), scope: 'openid offline_access', expiresAt: addDays(new Date(), 30) }
    });

    // Create Access Tokens that would have been derived from userARefreshToken1
    userA_AccessToken1_from_RT1 = await JWTUtils.createAccessToken({ userId: userA.id!, clientId: client.clientId, scope: 'openid api:read' });
    await prisma.accessToken.create({ data: { userId: userA.id!, clientId: client.id!, tokenHash: JWTUtils.getTokenHash(userA_AccessToken1_from_RT1), scope: 'openid api:read', expiresAt: addMinutes(new Date(), 60) }});

    userA_AccessToken2_from_RT1 = await JWTUtils.createAccessToken({ userId: userA.id!, clientId: client.clientId, scope: 'openid profile' });
    await prisma.accessToken.create({ data: { userId: userA.id!, clientId: client.id!, tokenHash: JWTUtils.getTokenHash(userA_AccessToken2_from_RT1), scope: 'openid profile', expiresAt: addMinutes(new Date(), 60) }});
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should allow an authenticated user to delete their own session (204)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/account/sessions/${userARefreshToken1Record.id}`, userASessionToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);

    const dbRefreshToken = await prisma.refreshToken.findUnique({ where: { id: userARefreshToken1Record.id } });
    expect(dbRefreshToken).toBeDefined();
    expect(dbRefreshToken!.isRevoked).toBe(true);

    // Verify JTI in blacklist
    const rt1Jti = jose.decodeJwt(userARefreshToken1Value).jti || userARefreshToken1Record.id;
    const blacklistedRt = await prisma.tokenBlacklist.findUnique({where: {jti: rt1Jti}});
    expect(blacklistedRt).toBeDefined();
    expect(blacklistedRt?.tokenType).toBe('refresh_token');

    // Verify associated access tokens are blacklisted due to cascading revocation
    const at1Jti = jose.decodeJwt(userA_AccessToken1_from_RT1).jti || (await prisma.accessToken.findFirst({where: {tokenHash: JWTUtils.getTokenHash(userA_AccessToken1_from_RT1)}}))?.id;
    const at2Jti = jose.decodeJwt(userA_AccessToken2_from_RT1).jti || (await prisma.accessToken.findFirst({where: {tokenHash: JWTUtils.getTokenHash(userA_AccessToken2_from_RT1)}}))?.id;

    if(at1Jti) {
        const blacklistedAt1 = await prisma.tokenBlacklist.findUnique({where: {jti: at1Jti}});
        expect(blacklistedAt1).toBeDefined();
        expect(blacklistedAt1?.tokenType).toBe('access_token');
    }
     if(at2Jti) {
        const blacklistedAt2 = await prisma.tokenBlacklist.findUnique({where: {jti: at2Jti}});
        expect(blacklistedAt2).toBeDefined();
        expect(blacklistedAt2?.tokenType).toBe('access_token');
    }


    // User A's other session should still be active
    const otherDbRefreshToken = await prisma.refreshToken.findUnique({ where: { id: userARefreshToken2Record.id } });
    expect(otherDbRefreshToken?.isRevoked).toBe(false);
  });

  it('should return 404 when trying to delete a non-existent session ID', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/account/sessions/clnonexistentsess123', userASessionToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });

  it('should return 404 when trying to delete a session belonging to another user', async () => {
    // User A trying to delete User B's session
    const response = await httpClient.authenticatedRequest(`/api/v2/account/sessions/${userBRefreshTokenRecord.id}`, userASessionToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404); // Or 403, but 404 is better to not reveal existence

    const dbUserBSession = await prisma.refreshToken.findUnique({ where: { id: userBRefreshTokenRecord.id } });
    expect(dbUserBSession?.isRevoked).toBe(false); // User B's session should not be affected
  });

  it('should return 204 if trying to delete an already revoked session belonging to the user', async () => {
    // First, revoke it
     await httpClient.authenticatedRequest(`/api/v2/account/sessions/${userARefreshToken1Record.id}`, userASessionToken, {
      method: 'DELETE',
    });
    // Then, try to revoke it again
    const response = await httpClient.authenticatedRequest(`/api/v2/account/sessions/${userARefreshToken1Record.id}`, userASessionToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);
  });


  it('should return 401 if no token is provided for deleting a session', async () => {
    const response = await httpClient.makeRequest(`/api/v2/account/sessions/${userARefreshToken1Record.id}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(401);
  });
});
