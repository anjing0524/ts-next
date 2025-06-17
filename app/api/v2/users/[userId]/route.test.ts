// app/api/v2/users/[userId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestUser, TestDataManager, TEST_USERS } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

const { httpClient, dataManager, setup, cleanup: globalCleanup } = createOAuth2TestSetup('user-id-api');

describe('GET /api/v2/users/{userId}', () => {
  let adminToken: string;
  let createdTestUser: TestUser; // To store user created for testing retrieval

  beforeAll(async () => {
    await setup();
    // Create admin user and get token (similar to user creation tests)
    const adminUser = await dataManager.createTestUser('ADMIN');
    const readPerm = await dataManager.findOrCreatePermission({ name: 'users:read', resource: 'users', action: 'read' });
    const adminRole = await dataManager.createRole({ name: 'test_admin_role_for_user_read', permissions: [readPerm.name] });
    await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);
    const testClient = await dataManager.createTestClient('CONFIDENTIAL');
    adminToken = await dataManager.createAccessToken(adminUser.id!, testClient.clientId, 'openid profile users:read', [readPerm.name]);

    // Create a user for retrieval tests
    createdTestUser = await dataManager.createUser({
      username: 'testretrieveuser',
      password: 'Password123!',
      email: 'retrieve@example.com',
      firstName: 'Retrieve',
      lastName: 'Me',
    });
  });

  afterAll(async () => {
    // Specific cleanup for this test suite if needed, then global
    if (createdTestUser && createdTestUser.id) {
      try {
        await prisma.user.delete({ where: { id: createdTestUser.id }});
      } catch (e) {
        // ignore if already deleted
      }
    }
    await globalCleanup();
  });

  it('should retrieve an existing user successfully with admin privileges (200)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${createdTestUser.id}`, adminToken, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const user = await response.json();

    expect(user.id).toBe(createdTestUser.id);
    expect(user.username).toBe(createdTestUser.username);
    expect(user.email).toBe(createdTestUser.email);
    expect(user.firstName).toBe(createdTestUser.firstName);
    expect(user.lastName).toBe(createdTestUser.lastName);
    expect(user.passwordHash).toBeUndefined(); // Password hash should not be returned
  });

  it('should return 404 for a non-existent user ID', async () => {
    const nonExistentUserId = 'clnonexistent12345'; // A CUID that likely doesn't exist
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${nonExistentUserId}`, adminToken, {
      method: 'GET',
    });

    expect(response.status).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Not Found');
    expect(error.message).toBe('User not found');
  });

  it('should return 403 for unauthorized access (e.g., insufficient permissions)', async () => {
    // Create a user and token without 'users:read' permission
    const regularUser = await dataManager.createTestUser('REGULAR'); // Assuming REGULAR user type exists
    // Ensure this role does NOT have 'users:read'
    const viewerRole = await dataManager.createRole({ name: 'limited_viewer_role_no_user_read', permissions: ['posts:read'] });
    await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
    const testClient = await dataManager.createTestClient('PUBLIC');
    const regularUserToken = await dataManager.createAccessToken(regularUser.id!, testClient.clientId, 'openid profile posts:read', ['posts:read']);


    const response = await httpClient.authenticatedRequest(`/api/v2/users/${createdTestUser.id}`, regularUserToken, {
      method: 'GET',
    });

    expect(response.status).toBe(403);
    const error = await response.json();
    expect(error.message).toContain("does not have permission 'users:read'");
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest(`/api/v2/users/${createdTestUser.id}`, {
      method: 'GET',
    });
    expect(response.status).toBe(401);
  });
});

// Placeholder for PUT (full update) tests - PATCH is preferred for this subtask
describe('PUT /api/v2/users/{userId}', () => {
  it.todo('should fully update an existing user successfully if PUT is implemented');
});

describe('PATCH /api/v2/users/{userId}', () => {
  let adminUpdateToken: string;
  let userToUpdate: TestUser;

  beforeAll(async () => {
    // Setup admin with 'users:update' permission
    const adminUserUpdater = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'adminupdater' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'users:update', resource: 'users', action: 'update' });
    const adminUpdateRole = await dataManager.createRole({ name: 'test_admin_role_for_user_update', permissions: [updatePerm.name] });
    await dataManager.assignRoleToUser(adminUserUpdater.id!, adminUpdateRole.id);
    const testClient = await dataManager.createTestClient('CONFIDENTIAL');
    adminUpdateToken = await dataManager.createAccessToken(adminUserUpdater.id!, testClient.clientId, 'openid profile users:update', [updatePerm.name]);
  });

  beforeEach(async () => {
    // Create a fresh user before each update test
    userToUpdate = await dataManager.createUser({
      username: 'userbeforeupdate',
      password: 'OldPassword123!',
      email: 'update@example.com',
      firstName: 'OriginalFirst',
      lastName: 'OriginalLast',
      isActive: true,
      mustChangePassword: true,
    });
  });

  afterEach(async () => {
    // Clean up the user created for update tests
    if (userToUpdate && userToUpdate.id) {
      try {
        await prisma.userRole.deleteMany({ where: { userId: userToUpdate.id }});
        await prisma.user.delete({ where: { id: userToUpdate.id } });
      } catch (e) { /* ignore if already deleted or other issues */ }
    }
  });

  it('should partially update user details (e.g., firstName, isActive) successfully (200)', async () => {
    const patchData = {
      firstName: 'UpdatedFirst',
      isActive: false,
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToUpdate.id}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(200);
    const updatedUser = await response.json();
    expect(updatedUser.firstName).toBe('UpdatedFirst');
    expect(updatedUser.isActive).toBe(false);
    expect(updatedUser.lastName).toBe(userToUpdate.lastName); // Should remain unchanged

    const dbUser = await prisma.user.findUnique({ where: { id: userToUpdate.id } });
    expect(dbUser?.firstName).toBe('UpdatedFirst');
    expect(dbUser?.isActive).toBe(false);
  });

  it('should update user password successfully and set mustChangePassword to true (200)', async () => {
    const patchData = {
      password: 'NewPassword123!',
      // mustChangePassword: false, // Optionally test this explicitly
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToUpdate.id}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(200);
    const updatedUser = await response.json();
    expect(updatedUser.mustChangePassword).toBe(true); // Default behavior when admin sets password

    const dbUser = await prisma.user.findUnique({ where: { id: userToUpdate.id } });
    expect(dbUser?.passwordHash).not.toBe(userToUpdate.password); // Ensure hash changed
    const { AuthUtils } = await import('@/lib/auth/passwordUtils'); // Assuming bcrypt is used there
    const isNewPasswordCorrect = await AuthUtils.comparePassword(patchData.password, dbUser!.passwordHash);
    expect(isNewPasswordCorrect).toBe(true);
  });

  it('should allow explicitly setting mustChangePassword to false when updating password (200)', async () => {
    const patchData = {
      password: 'NewPasswordSecure123!',
      mustChangePassword: false,
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToUpdate.id}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(200);
    const updatedUser = await response.json();
    expect(updatedUser.mustChangePassword).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { id: userToUpdate.id } });
    expect(dbUser?.mustChangePassword).toBe(false);
  });


  it('should reject username change attempts (400)', async () => {
    const patchData = {
      username: 'cannotchangeusername',
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToUpdate.id}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Username modification is not allowed');
  });

  it('should return 404 when trying to update a non-existent user', async () => {
    const patchData = { firstName: 'NonExistent' };
    const response = await httpClient.authenticatedRequest('/api/v2/users/nonexistentuserid', adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid email format in PATCH data', async () => {
    const patchData = { email: 'invalidemail' };
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToUpdate.id}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "email", message: expect.stringContaining("Invalid email address") })
    ]));
  });
});

describe('DELETE /api/v2/users/{userId}', () => {
  let adminDeleteToken: string;
  let userToDelete: TestUser;

  beforeAll(async () => {
    // Setup admin with 'users:delete' permission
    const adminUserDeleter = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'admindeleter' });
    const deletePerm = await dataManager.findOrCreatePermission({ name: 'users:delete', resource: 'users', action: 'delete' });
    const adminDeleteRole = await dataManager.createRole({ name: 'test_admin_role_for_user_delete', permissions: [deletePerm.name] });
    await dataManager.assignRoleToUser(adminUserDeleter.id!, adminDeleteRole.id);
    const testClient = await dataManager.createTestClient('CONFIDENTIAL');
    adminDeleteToken = await dataManager.createAccessToken(adminUserDeleter.id!, testClient.clientId, 'openid profile users:delete', [deletePerm.name]);
  });

  beforeEach(async () => {
    // Create a fresh user before each delete test
    userToDelete = await dataManager.createUser({
      username: 'userfordeletion',
      password: 'Password123!',
      email: 'delete@example.com',
    });
  });

  it('should delete an existing user successfully (204)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToDelete.id}`, adminDeleteToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);

    const dbUser = await prisma.user.findUnique({ where: { id: userToDelete.id } });
    expect(dbUser).toBeNull();
  });

  it('should return 404 when trying to delete a non-existent user', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/users/nonexistentuserid', adminDeleteToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });

  it('should prevent admin from self-deleting (403)', async () => {
    // Use the adminDeleteToken's own user ID (adminUserDeleter's ID)
    const adminUserDeleter = await prisma.user.findUnique({where: {username: 'admindeleter'}});
    if (!adminUserDeleter) throw new Error("Admin deleter user not found for self-deletion test");

    const response = await httpClient.authenticatedRequest(`/api/v2/users/${adminUserDeleter.id}`, adminDeleteToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(403);
    const error = await response.json();
    expect(error.message).toContain('Administrators cannot delete their own account');
  });

  it('should return 403 for unauthorized deletion (insufficient permissions)', async () => {
    const regularUser = await dataManager.createTestUser('REGULAR');
     // Token without 'users:delete'
    const viewerRole = await dataManager.createTestRole('VIEWER');
    await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
    const testClient = await dataManager.createTestClient('PUBLIC');
    const regularUserToken = await dataManager.createAccessToken(regularUser.id!, testClient.clientId, 'openid profile', []);


    const response = await httpClient.authenticatedRequest(`/api/v2/users/${userToDelete.id}`, regularUserToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(403);
  });
});
