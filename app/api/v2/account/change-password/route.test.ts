// app/api/v2/account/change-password/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '@/lib/auth/passwordUtils';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('account-change-password-api');

describe('/api/v2/account/change-password', () => {
  let userToken: string;
  let user: TestUser;
  const initialPassword = 'Password123!'; // Must meet complexity

  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create a fresh user with a known password for each test
    // Ensure this user is cleaned up properly by global cleanup or add specific cleanup if TestDataManager doesn't handle it fully based on username prefix
    user = await dataManager.createUser({
      ...TEST_USERS.REGULAR,
      username: 'changepassuser',
      email: 'changepass@example.com',
      password: initialPassword, // createUser hashes this
      mustChangePassword: false, // Start with false for this test
    });

    const tokenClient = await dataManager.createClient({
      clientId: 'changepass-test-client',
      clientName: 'ChangePass Test Client',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'changepasssecret',
      redirectUris: ['http://localhost/cb'],
      allowedScopes: ['openid', 'profile'],
      grantTypes: ['password']
    });
    userToken = await dataManager.createAccessToken(user.id!, tokenClient.clientId, 'openid profile');

    // Clear password history for this user before each test for predictability
    await prisma.passwordHistory.deleteMany({ where: { userId: user.id } });
    // Add initial password to history
    const initialPasswordHash = await bcrypt.hash(initialPassword, SALT_ROUNDS);
    await prisma.passwordHistory.create({
        data: { userId: user.id!, passwordHash: initialPasswordHash }
    });
  });

  it('should allow an authenticated user to change their own password successfully (200)', async () => {
    const newPassword = 'NewPassword456!';
    const payload = {
      currentPassword: initialPassword,
      newPassword: newPassword,
      confirmNewPassword: newPassword,
    };

    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.message).toBe('Password changed successfully.');

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.mustChangePassword).toBe(false);
    const isNewPasswordCorrect = await bcrypt.compare(newPassword, dbUser!.passwordHash);
    expect(isNewPasswordCorrect).toBe(true);

    const history = await prisma.passwordHistory.findMany({ where: { userId: user.id }, orderBy: {createdAt: 'desc'}});
    expect(history.length).toBeGreaterThanOrEqual(2); // Initial + new one
    const isNewPasswordInHistory = await bcrypt.compare(newPassword, history[0].passwordHash);
    expect(isNewPasswordInHistory).toBe(true);
  });

  it('should return 400 if currentPassword is incorrect', async () => {
    const payload = {
      currentPassword: 'WrongOldPassword123!',
      newPassword: 'NewPassword456!',
      confirmNewPassword: 'NewPassword456!',
    };
    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toBe('Incorrect current password.');
  });

  it('should return 400 if newPassword and confirmNewPassword do not match', async () => {
    const payload = {
      currentPassword: initialPassword,
      newPassword: 'NewPassword456!',
      confirmNewPassword: 'DoesNotMatch789!',
    };
    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["confirmNewPassword"]})
    ]));
  });

  it('should return 400 if newPassword does not meet complexity requirements', async () => {
    const payload = {
      currentPassword: initialPassword,
      newPassword: 'weak',
      confirmNewPassword: 'weak',
    };
    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(400); // Zod validation failure
    const error = await response.json();
    expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["newPassword"] })
    ]));
  });

  it('should return 400 if newPassword is the same as currentPassword', async () => {
    const payload = {
      currentPassword: initialPassword,
      newPassword: initialPassword, // Same as current
      confirmNewPassword: initialPassword,
    };
    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toBe('New password cannot be the same as the current password.');
  });

  it('should return 422 if newPassword is in recent password history', async () => {
    // First change (this one will be in history)
    const firstNewPassword = 'NewPasswordHistorical!';
    await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
        method: 'POST',
        body: JSON.stringify({ currentPassword: initialPassword, newPassword: firstNewPassword, confirmNewPassword: firstNewPassword }),
    });

    // Attempt to change back to initialPassword (which is now "historical" in a sense, but the immediate previous is firstNewPassword)
    // Or rather, attempt to change to a password that was used before firstNewPassword
    // Let's change it to 'Password123!' again after changing it to firstNewPassword.
    // The checkPasswordHistory checks against the *new* password if it's in history.
    // So, if we set it to 'initialPassword' again, it should fail.

    const payload = {
      currentPassword: firstNewPassword, // Current password is now firstNewPassword
      newPassword: initialPassword,      // Attempting to reuse initialPassword
      confirmNewPassword: initialPassword,
    };
    const response = await httpClient.authenticatedRequest('/api/v2/account/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(422);
    const error = await response.json();
    expect(error.message).toContain('New password cannot be the same as one of your recent passwords');
  });


  it('should return 401 if no token is provided', async () => {
    const payload = { currentPassword: 'a', newPassword: 'b', confirmNewPassword: 'b' };
    const response = await httpClient.makeRequest('/api/v2/account/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(401);
  });
});
