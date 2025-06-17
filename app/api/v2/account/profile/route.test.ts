// app/api/v2/account/profile/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('account-profile-api');

describe('/api/v2/account/profile', () => {
  let userAToken: string;
  let userA: TestUser;
  let userBToken: string; // For testing cross-user access prevention (implicitly)
  let userB: TestUser;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'userAprofile', email: 'usera.profile@example.com' });
    userB = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'userBprofile', email: 'userb.profile@example.com' });

    const tokenClient = await dataManager.createClient({
      clientId: 'profile-test-client',
      clientName: 'Profile Test Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'profsecret123',
      redirectUris: ['http://localhost/cb'],
      allowedScopes: ['openid', 'profile', 'email'], // Ensure necessary scopes for profile
      grantTypes: ['password'] // Assuming password grant for simplicity in test token generation
    });

    userAToken = await dataManager.createAccessToken(userA.id!, tokenClient.clientId, 'openid profile email');
    userBToken = await dataManager.createAccessToken(userB.id!, tokenClient.clientId, 'openid profile email');
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v2/account/profile', () => {
    it('should allow an authenticated user to retrieve their own profile (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken);
      expect(response.status).toBe(200);
      const profile = await response.json();

      expect(profile.id).toBe(userA.id);
      expect(profile.username).toBe(userA.username);
      expect(profile.email).toBe(userA.email);
      expect(profile.firstName).toBe(userA.firstName);
      expect(profile.passwordHash).toBeUndefined();
    });

    it('should return 401 if no token is provided', async () => {
      const response = await httpClient.makeRequest('/api/v2/account/profile');
      expect(response.status).toBe(401);
    });

    it('should return 401 for an invalid or expired token', async () => {
        const expiredToken = await dataManager.createAccessToken(userA.id!, 'profile-test-client', 'openid', [], '0s'); // Token that expires immediately
        const response = await httpClient.authenticatedRequest('/api/v2/account/profile', expiredToken);
        expect(response.status).toBe(401); // Or based on how your JWTUtils/requirePermission handles expired.
    });
  });

  describe('PUT /api/v2/account/profile', () => {
    it('should allow an authenticated user to update their own profile (200)', async () => {
      const updatePayload = {
        firstName: 'UserA-UpdatedFirst',
        lastName: 'UserA-UpdatedLast',
        displayName: 'UserA Updated',
        avatar: 'https://example.com/avatarA_updated.png',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedProfile = await response.json();

      expect(updatedProfile.firstName).toBe(updatePayload.firstName);
      expect(updatedProfile.lastName).toBe(updatePayload.lastName);
      expect(updatedProfile.displayName).toBe(updatePayload.displayName);
      expect(updatedProfile.avatar).toBe(updatePayload.avatar);

      const dbUser = await prisma.user.findUnique({ where: { id: userA.id } });
      expect(dbUser?.firstName).toBe(updatePayload.firstName);
      expect(dbUser?.avatar).toBe(updatePayload.avatar);
    });

    it('should allow updating email if it is not taken (200)', async () => {
      const updatePayload = {
        email: 'usera.newprofilemail@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedProfile = await response.json();
      expect(updatedProfile.email).toBe(updatePayload.email);
    });

    it('should prevent updating email if the new email is already taken by another user (409)', async () => {
      const updatePayload = {
        email: userB.email, // Attempt to take User B's email
      };
      const response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.message).toContain('Email address is already in use');
    });

    it('should return 400 for invalid data (e.g., invalid email format, too long string)', async () => {
      const invalidPayload = { email: 'not-an-email' };
      let response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
        method: 'PUT',
        body: JSON.stringify(invalidPayload),
      });
      expect(response.status).toBe(400);
      let error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ field: "email" })
      ]));

      const tooLongName = 'a'.repeat(101);
      const invalidPayload2 = { firstName: tooLongName };
      response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
        method: 'PUT',
        body: JSON.stringify(invalidPayload2),
      });
      expect(response.status).toBe(400);
      error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ field: "firstName", message: expect.stringContaining("100") })
      ]));
    });

    it('should return 400 if no fields are provided for update', async () => {
        const response = await httpClient.authenticatedRequest('/api/v2/account/profile', userAToken, {
            method: 'PUT',
            body: JSON.stringify({}), // Empty payload
        });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.message).toContain("No fields provided for update");
    });

    it('should return 401 if no token is provided for PUT', async () => {
      const response = await httpClient.makeRequest('/api/v2/account/profile', {
        method: 'PUT',
        body: JSON.stringify({ firstName: 'Attempt' }),
      });
      expect(response.status).toBe(401);
    });
  });
});
