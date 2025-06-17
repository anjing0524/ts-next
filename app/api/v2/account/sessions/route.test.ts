// app/api/v2/account/sessions/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, RefreshToken } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2'; // For creating tokens for setup
import { addDays, subDays } from 'date-fns';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('account-sessions-list-api');

describe('GET /api/v2/account/sessions', () => {
  let userToken: string;
  let user: TestUser;
  let client1: TestClient;
  let client2: TestClient;

  beforeAll(async () => {
    await setup();
    user = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'sessionuser', email: 'sessionuser@example.com' });

    client1 = await dataManager.createClient({
      clientId: 'session-client-1',
      clientName: 'Session Client 1',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 's1secret',
      redirectUris: ['http://localhost/cb1'],
      allowedScopes: ['openid', 'offline_access'],
      grantTypes: ['refresh_token', 'authorization_code']
    });
    client2 = await dataManager.createClient({
      clientId: 'session-client-2',
      clientName: 'Session Client 2',
      clientType: ClientType.PUBLIC,
      redirectUris: ['http://localhost/cb2'],
      allowedScopes: ['openid', 'offline_access'],
      grantTypes: ['refresh_token', 'authorization_code']
    });

    // Generate an access token for the user to make the API call
    userToken = await dataManager.createAccessToken(user.id!, client1.clientId, 'openid');

    // Create some refresh tokens (sessions) for the user
    const rt1Value = await JWTUtils.createRefreshToken({ userId: user.id!, clientId: client1.clientId, scope: 'openid offline_access' });
    await prisma.refreshToken.create({
      data: {
        userId: user.id!,
        clientId: client1.id!, // Prisma ID
        tokenHash: JWTUtils.getTokenHash(rt1Value),
        scope: 'openid offline_access',
        expiresAt: addDays(new Date(), 30),
        createdAt: subDays(new Date(), 2) // Older session
      }
    });

    const rt2Value = await JWTUtils.createRefreshToken({ userId: user.id!, clientId: client2.clientId, scope: 'openid offline_access' });
    await prisma.refreshToken.create({
      data: {
        userId: user.id!,
        clientId: client2.id!, // Prisma ID
        tokenHash: JWTUtils.getTokenHash(rt2Value),
        scope: 'openid offline_access',
        expiresAt: addDays(new Date(), 60),
        createdAt: subDays(new Date(), 1) // Newer session
      }
    });

    // Create an expired session for the same user (should not be listed)
    const rtExpiredValue = await JWTUtils.createRefreshToken({ userId: user.id!, clientId: client1.clientId, scope: 'openid offline_access' });
    await prisma.refreshToken.create({
      data: {
        userId: user.id!,
        clientId: client1.id!,
        tokenHash: JWTUtils.getTokenHash(rtExpiredValue),
        scope: 'openid offline_access',
        expiresAt: subDays(new Date(), 1), // Expired
      }
    });

    // Create a revoked session for the same user (should not be listed)
    const rtRevokedValue = await JWTUtils.createRefreshToken({ userId: user.id!, clientId: client1.clientId, scope: 'openid offline_access' });
    await prisma.refreshToken.create({
      data: {
        userId: user.id!,
        clientId: client1.id!,
        tokenHash: JWTUtils.getTokenHash(rtRevokedValue),
        scope: 'openid offline_access',
        expiresAt: addDays(new Date(), 30),
        isRevoked: true, // Revoked
      }
    });

    // Create a session for another user (should not be listed)
    const otherUser = await dataManager.createUser({...TEST_USERS.ADMIN, username: 'otheruser_sessions'});
    const rtOtherUserValue = await JWTUtils.createRefreshToken({ userId: otherUser.id!, clientId: client1.clientId, scope: 'openid offline_access' });
    await prisma.refreshToken.create({
        data: { userId: otherUser.id!, clientId: client1.id!, tokenHash: JWTUtils.getTokenHash(rtOtherUserValue), scope: 'openid', expiresAt: addDays(new Date(), 30)}
    });

  });

  afterAll(async () => {
    await cleanup(); // This should clean up users and clients by dataManager
    // Additional explicit cleanup for refresh tokens might be needed if not handled by cascade or prefix
    await prisma.refreshToken.deleteMany({where: {userId: user.id}});
    const otherUser = await prisma.user.findUnique({where: {username: 'otheruser_sessions'}});
    if(otherUser) await prisma.refreshToken.deleteMany({where: {userId: otherUser.id}});
  });

  it('should list active sessions (refresh tokens) for the authenticated user, ordered by creation (newest first)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/account/sessions', userToken);
    expect(response.status).toBe(200);
    const sessions = await response.json();

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(2); // Only the two active, non-revoked sessions for 'user'

    // Check order (newest first based on createdAt)
    expect(new Date(sessions[0].createdAt).getTime()).toBeGreaterThan(new Date(sessions[1].createdAt).getTime());

    const sessionForClient2 = sessions.find((s: any) => s.clientId === client2.clientId);
    expect(sessionForClient2).toBeDefined();
    expect(sessionForClient2.clientName).toBe(client2.clientName);
    expect(sessionForClient2.id).toBeDefined(); // This is RefreshToken.id
    // expect(sessionForClient2.isCurrentSession).toBe(false); // Defaulted to false

    const sessionForClient1 = sessions.find((s: any) => s.clientId === client1.clientId);
    expect(sessionForClient1).toBeDefined();
  });

  it('should return an empty list if the user has no active sessions', async () => {
    // Create a new user with no sessions
    const noSessionUser = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'nosessionuser', email: 'nosession@example.com'});
    const noSessionToken = await dataManager.createAccessToken(noSessionUser.id!, client1.clientId, 'openid');

    const response = await httpClient.authenticatedRequest('/api/v2/account/sessions', noSessionToken);
    expect(response.status).toBe(200);
    const sessions = await response.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(0);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/account/sessions');
    expect(response.status).toBe(401);
  });
});
