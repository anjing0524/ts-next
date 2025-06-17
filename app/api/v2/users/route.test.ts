// app/api/v2/users/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestUser, TestClient, TestDataManager, TEST_USERS, TEST_ROLES, TEST_PERMISSIONS } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('user-api');

// Helper function to create an admin user and get an access token
async function getAdminAccessToken(): Promise<string> {
  // Create a core admin user
  const adminUser = await dataManager.createUser(TEST_USERS.ADMIN);

  // Create 'users:create' permission if it doesn't exist
  const createPerm = await dataManager.findOrCreatePermission(TEST_PERMISSIONS.USER_CREATE);
  const readPerm = await dataManager.findOrCreatePermission(TEST_PERMISSIONS.USER_READ); // For later tests
  const listPerm = await dataManager.findOrCreatePermission({ name: 'users:list', resource: 'users', action: 'list' });


  // Create an admin role with 'users:create' permission
  const adminRoleData = {
    name: 'test_admin_role_for_user_creation',
    permissions: [createPerm.name, readPerm.name, listPerm.name], // Grant create, read, list permissions
  };
  const adminRole = await dataManager.createRole(adminRoleData);

  // Assign admin role to the admin user
  await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

  // Create a dummy client for token generation
  const testClient = await dataManager.createTestClient('CONFIDENTIAL');

  // Generate access token for the admin user
  // Ensure createAccessToken in TestDataManager can include permissions from roles
  // For now, let's assume JWTUtils will pick up user's effective permissions
  const accessToken = await dataManager.createAccessToken(adminUser.id!, testClient.clientId, 'openid profile users:create users:read users:list', [createPerm.name, readPerm.name, listPerm.name]);
  return accessToken;
}

describe('User API Endpoints (/api/v2/users)', () => {
  let adminToken: string;

  beforeAll(async ()
=> {
    await setup();
    adminToken = await getAdminAccessToken();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up users created during tests, but not the admin/roles/permissions needed for auth
    // This might require more granular cleanup in TestDataManager or selective cleanup here
    const users = await prisma.user.findMany({ where: { username: { startsWith: 'newtestuser' } } });
    const userIds = users.map(u => u.id);
    if (userIds.length > 0) {
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  describe('POST /api/v2/users', () => {
    it('should create a new user successfully with admin privileges (201)', async () => {
      const newUser = {
        username: 'newtestuser_01',
        password: 'Password123!',
        email: 'newuser01@example.com',
        firstName: 'New',
        lastName: 'User',
        isActive: true,
        mustChangePassword: false,
      };

      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });

      expect(response.status).toBe(201);
      const createdUser = await response.json();

      expect(createdUser.id).toBeDefined();
      expect(createdUser.username).toBe(newUser.username);
      expect(createdUser.email).toBe(newUser.email);
      expect(createdUser.firstName).toBe(newUser.firstName);
      expect(createdUser.lastName).toBe(newUser.lastName);
      expect(createdUser.isActive).toBe(newUser.isActive);
      expect(createdUser.mustChangePassword).toBe(newUser.mustChangePassword);
      expect(createdUser.passwordHash).toBeUndefined(); // Password hash should not be returned

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { username: newUser.username } });
      expect(dbUser).toBeDefined();
      expect(dbUser?.username).toBe(newUser.username);
      expect(dbUser?.passwordHash).toBeDefined();
      expect(dbUser?.passwordHash).not.toBe(newUser.password); // Ensure it's hashed
      // TODO: Add createdBy check once available
    });

    it('should return 400 for missing username', async () => {
      const newUser = {
        // username: 'missing_username_user',
        password: 'Password123!',
        email: 'missingusername@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "username", message: expect.any(String) })
      ]));
    });

    it('should return 400 for weak password (e.g., too short)', async () => {
      const newUser = {
        username: 'newtestuser_weakpass',
        password: 'short',
        email: 'weakpass@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "password", message: expect.stringContaining("Password must be at least 8 characters long") })
      ]));
    });

    it('should return 400 for password without uppercase letter', async () => {
      const newUser = {
        username: 'newtestuser_noupper',
        password: 'password123!',
        email: 'noupper@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
       expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "password", message: expect.stringContaining("uppercase letter") })
      ]));
    });

    it('should return 400 for password without lowercase letter', async () => {
      const newUser = {
        username: 'newtestuser_nolower',
        password: 'PASSWORD123!',
        email: 'nolower@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "password", message: expect.stringContaining("lowercase letter") })
      ]));
    });

    it('should return 400 for password without a number', async () => {
      const newUser = {
        username: 'newtestuser_nonumber',
        password: 'PasswordABC!',
        email: 'nonumber@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "password", message: expect.stringContaining("number") })
      ]));
    });

    it('should return 400 for password without a special character', async () => {
      const newUser = {
        username: 'newtestuser_nospecial',
        password: 'Password123A',
        email: 'nospecial@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "password", message: expect.stringContaining("special character") })
      ]));
    });

    it('should return 409 when creating a user with an existing username', async () => {
      // First, create a user to ensure one exists
      await dataManager.createUser({ username: 'existinguser', password: 'Password123!' });

      const newUser = {
        username: 'existinguser', // This username now exists
        password: 'AnotherPassword123!',
        email: 'duplicateuser@example.com',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.error).toBe('Conflict');
      expect(error.message).toBe('Username already exists');
    });

    it('should return 403 for unauthorized access (no token or non-admin token)', async () => {
      const newUser = {
        username: 'newtestuser_unauth',
        password: 'Password123!',
        email: 'unauth@example.com',
      };
      // Attempt without token
      let response = await httpClient.makeRequest('/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(401); // Or 403 depending on middleware stack

      // Attempt with a non-admin user token (if possible to create easily)
      // This requires creating a regular user, their role, and a token without 'users:create'
      const regularUser = await dataManager.createTestUser('REGULAR');
      const viewerRole = await dataManager.createTestRole('VIEWER'); // Assuming VIEWER doesn't have users:create
      await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
      const testClient = await dataManager.createTestClient('PUBLIC');
      const regularUserToken = await dataManager.createAccessToken(regularUser.id!, testClient.clientId, 'openid profile', []); // No users:create permission

      response = await httpClient.authenticatedRequest('/api/v2/users', regularUserToken, {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v2/users (List Users)', () => {
    beforeAll(async () => {
      // Ensure at least a few users exist for listing, beyond the admin user
      // The admin user from getAdminAccessToken() will also be in the list
      await dataManager.createUser({ username: 'listuser1', password: 'Password123!', email: 'list1@example.com' });
      await dataManager.createUser({ username: 'listuser2', password: 'Password123!', email: 'list2@example.com' });
    });

    it('should list users successfully for an admin with pagination info (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/users', adminToken, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      expect(Array.isArray(result.users)).toBe(true);
      expect(result.users.length).toBeGreaterThanOrEqual(2); // listuser1, listuser2, plus admin and any other test users

      // Check for one of the created users (excluding password)
      const foundUser = result.users.find((u: TestUser) => u.username === 'listuser1');
      expect(foundUser).toBeDefined();
      expect(foundUser.email).toBe('list1@example.com');
      expect(foundUser.passwordHash).toBeUndefined();

      // Check for pagination fields
      expect(result.total).toBeDefined();
      expect(result.page).toBeDefined();
      expect(result.pageSize).toBeDefined();
      expect(result.totalPages).toBeDefined();
    });

    it('should respect pageSize and page query parameters', async () => {
      // Create enough users to test pagination
      for (let i = 0; i < 5; i++) {
        await dataManager.createUser({ username: `pageuser${i}`, password: 'Password123!', email: `page${i}@example.com` });
      }

      const responsePage1 = await httpClient.authenticatedRequest('/api/v2/users?page=1&pageSize=2', adminToken, {
        method: 'GET',
      });
      expect(responsePage1.status).toBe(200);
      const page1Data = await responsePage1.json();
      expect(page1Data.users.length).toBe(2);
      expect(page1Data.page).toBe(1);
      expect(page1Data.pageSize).toBe(2);

      const responsePage2 = await httpClient.authenticatedRequest('/api/v2/users?page=2&pageSize=2', adminToken, {
        method: 'GET',
      });
      expect(responsePage2.status).toBe(200);
      const page2Data = await responsePage2.json();
      expect(page2Data.users.length).toBeGreaterThanOrEqual(0); // Could be less than pageSize on last page
      expect(page2Data.page).toBe(2);
      expect(page2Data.pageSize).toBe(2);

      // Ensure users on page 1 and page 2 are different if total users are enough
      if (page1Data.users.length > 0 && page2Data.users.length > 0 && page1Data.total > 2) {
        const page1UserIds = page1Data.users.map((u: TestUser) => u.id);
        const page2UserIds = page2Data.users.map((u: TestUser) => u.id);
        page1UserIds.forEach((id: string) => expect(page2UserIds).not.toContain(id));
      }
    });

    it('should return 403 for unauthorized access (e.g., insufficient permissions)', async () => {
      const regularUser = await dataManager.createTestUser('REGULAR');
      const viewerRole = await dataManager.createTestRole('VIEWER'); // Assuming VIEWER doesn't have users:list
      await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
      const testClient = await dataManager.createTestClient('PUBLIC');
      // Token without 'users:list'
      const regularUserToken = await dataManager.createAccessToken(regularUser.id!, testClient.clientId, 'openid profile', ['posts:read']);

      const response = await httpClient.authenticatedRequest('/api/v2/users', regularUserToken, {
        method: 'GET',
      });
      expect(response.status).toBe(403);
    });

    it('should return 401 if no token is provided', async () => {
      const response = await httpClient.makeRequest('/api/v2/users', {
        method: 'GET',
      });
      expect(response.status).toBe(401);
    });
  });
});

// describe('GET /api/v2/users/{userId} (Get Single User)', () => {
//   // These tests would typically be in a separate file like [userId]/route.test.ts
//   // For now, keeping the placeholder if actual file for {userId} is separate.
//   it.todo('should retrieve an existing user successfully for an admin');
//   it.todo('should return 404 for a non-existent user');
//   it.todo('should return 403 for unauthorized access when retrieving a user');
// });
