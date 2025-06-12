import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { addMinutes, addDays } from 'date-fns';

describe('Database Schema Relationships Integrity Tests', () => {
  let testUser: any = null;
  let testUser2: any = null;
  let testClient: any = null;
  let testResource: any = null;
  let testPermission: any = null;
  let testScope: any = null;
  let testDataSuffix: string;

  beforeAll(async () => {
    // Generate unique suffix for this test run to avoid conflicts
    testDataSuffix = Date.now().toString() + '-' + crypto.randomBytes(4).toString('hex');
    console.log('🚀 Setting up Schema Relationships test data...');
    await setupTestData();
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up Schema Relationships test data...');
    await cleanupTestData();
  });

  async function setupTestData(): Promise<void> {
    try {
      // First, clean up any potentially existing test data with our naming pattern
      await cleanupExistingTestData();

      const password = await bcrypt.hash('SchemaTest123!', 12);

      // Create test users
      testUser = await prisma.user.create({
        data: {
          username: 'schema-user1-' + testDataSuffix,
          email: `schema-user1-${testDataSuffix}@example.com`,
          passwordHash: password, // Corrected field name
          // emailVerified: true, // Removed
          isActive: true,
          firstName: 'Schema',
          lastName: 'User1',
        },
      });

      testUser2 = await prisma.user.create({
        data: {
          username: 'schema-user2-' + testDataSuffix,
          email: `schema-user2-${testDataSuffix}@example.com`,
          passwordHash: password, // Corrected field name
          // emailVerified: true, // Removed
          isActive: true,
          firstName: 'Schema',
          lastName: 'User2',
        },
      });

      // Create test client
      testClient = await prisma.oAuthClient.create({ // Corrected model name
        data: {
          clientId: 'schema-client-' + testDataSuffix,
          clientSecret: await bcrypt.hash('schema-secret', 12),
          clientName: `Schema Test Client ${testDataSuffix}`, // Corrected field name
          clientType: 'CONFIDENTIAL', // Corrected field
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
          responseTypes: JSON.stringify(['code']),
          allowedScopes: JSON.stringify('openid profile email test:read test:write'.split(' ')), // Corrected field name & format
          isActive: true,
        },
      });

      // Create test resource with unique name - REMOVED as Resource model does not exist
      // testResource = await prisma.resource.create({
      //   data: {
      //     name: `SCHEMA_TEST_RESOURCE_${testDataSuffix}`,
      //     description: 'Test resource for schema validation',
      //     apiPath: '/api/test/*',
      //     isActive: true,
      //   },
      // });
      testResource = null; // Ensure it's null

      // Create test permission with unique name
      testPermission = await prisma.permission.create({
        data: {
          name: `SCHEMA_TEST_PERMISSION_${testDataSuffix}`,
          displayName: `Test Display Permission ${testDataSuffix}`, // Added
          description: 'Test permission for schema validation',
          resource: `test_resource_perm_${testDataSuffix}`, // Added
          action: 'read', // Added
          isActive: true,
        },
      });

      // Create test scope with unique name
      testScope = await prisma.scope.create({
        data: {
          name: `schema:test:${testDataSuffix}`,
          description: 'Test scope for schema validation',
          isActive: true,
          isPublic: false,
        },
      });

      console.log('✅ Schema Relationships test data setup complete');
    } catch (error) {
      console.error('❌ Failed to setup Schema test data:', error);
      throw error;
    }
  }

  async function cleanupExistingTestData(): Promise<void> {
    try {
      // Clean up any leftover test data from previous runs
      // await prisma.resource // REMOVED
      //   .deleteMany({
      //     where: {
      //       name: {
      //         startsWith: 'SCHEMA_TEST_RESOURCE',
      //       },
      //     },
      //   })
      //   .catch(() => {});

      await prisma.permission
        .deleteMany({
          where: {
            name: {
              startsWith: 'SCHEMA_TEST_PERMISSION',
            },
          },
        })
        .catch(() => {});

      await prisma.scope
        .deleteMany({
          where: {
            name: {
              startsWith: 'schema:test',
            },
          },
        })
        .catch(() => {});

      await prisma.oAuthClient // Corrected model name
        .deleteMany({
          where: {
            clientId: {
              startsWith: 'schema-client-',
            },
          },
        })
        .catch(() => {});

      await prisma.user
        .deleteMany({
          where: {
            username: {
              startsWith: 'schema-user',
            },
          },
        })
        .catch(() => {});
    } catch (error) {
      console.error('Warning: Failed to cleanup existing test data:', error);
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      // Clean up in reverse order to respect foreign key constraints
      // await prisma.userResourcePermission // REMOVED
      //   .deleteMany({
      //     where: {
      //       OR: [{ userId: testUser?.id }, { userId: testUser2?.id }],
      //     },
      //   })
      //   .catch(() => {});

      await prisma.accessToken.deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } }).catch(() => {});
      await prisma.authorizationCode
        .deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } })
        .catch(() => {});
      // UserSession model is deprecated/removed in favor of JWTs.

      await prisma.auditLog
        .deleteMany({
          where: {
            OR: [
              { userId: testUser?.id },
              { userId: testUser2?.id },
              { actorId: testClient?.id, actorType: 'CLIENT' } // Adjusted for AuditLog schema
            ],
          },
        })
        .catch(() => {});

      if (testScope?.id) await prisma.scope.delete({ where: { id: testScope.id } }).catch(() => {});
      if (testPermission?.id)
        await prisma.permission.delete({ where: { id: testPermission.id } }).catch(() => {});
      // if (testResource?.id) // REMOVED
      //   await prisma.resource.delete({ where: { id: testResource.id } }).catch(() => {});
      if (testClient?.id)
        await prisma.oAuthClient.delete({ where: { id: testClient.id } }).catch(() => {}); // Corrected model name
      if (testUser?.id) await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
      if (testUser2?.id) await prisma.user.delete({ where: { id: testUser2.id } }).catch(() => {});

      // Additional cleanup for any remaining test data from this run
      await cleanupExistingTestData();

      console.log('✅ Schema Relationships test data cleanup complete');
    } catch (error) {
      console.error('❌ Failed to cleanup Schema test data:', error);
    }
  }

  describe('1. User Entity Relationships', () => {
    it('should create and validate User → AccessToken relationship', async () => {
      const accessToken = await prisma.accessToken.create({
        data: {
          token: 'user_access_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('test_token').digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser.id,
          clientId: testClient.id,
          scope: 'openid profile',
        },
      });

      // Verify relationship
      const userWithTokens = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { accessTokens: true },
      });

      expect(userWithTokens).toBeTruthy();
      expect(userWithTokens!.accessTokens.length).toBeGreaterThan(0);
      expect(userWithTokens!.accessTokens[0].id).toBe(accessToken.id);

      // Cleanup
      await prisma.accessToken.delete({ where: { id: accessToken.id } });
      console.log('✅ User → AccessToken relationship validated');
    });

    it('should create and validate User → RefreshToken relationship', async () => {
      const refreshToken = await prisma.refreshToken.create({
        data: {
          token: 'user_refresh_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('test_refresh').digest('hex'),
          expiresAt: addDays(new Date(), 30),
          userId: testUser.id,
          clientId: testClient.id,
          scope: 'openid profile offline_access',
        },
      });

      // Verify relationship
      const userWithRefreshTokens = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { refreshTokens: true },
      });

      expect(userWithRefreshTokens).toBeTruthy();
      expect(userWithRefreshTokens!.refreshTokens.length).toBeGreaterThan(0);
      expect(userWithRefreshTokens!.refreshTokens[0].id).toBe(refreshToken.id);

      // Cleanup
      await prisma.refreshToken.delete({ where: { id: refreshToken.id } });
      console.log('✅ User → RefreshToken relationship validated');
    });

    it('should create and validate User → AuthorizationCode relationship', async () => {
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'user_auth_code_' + crypto.randomBytes(16).toString('hex'),
          expiresAt: addMinutes(new Date(), 10),
          redirectUri: 'http://localhost:3000/callback',
          userId: testUser.id,
          clientId: testClient.id,
          scope: 'openid profile',
          // state: 'test-state', // Removed: 'state' is not a field in AuthorizationCode model
        },
      });

      // Verify relationship
      const userWithAuthCodes = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { authorizationCodes: true },
      });

      expect(userWithAuthCodes).toBeTruthy();
      expect(userWithAuthCodes!.authorizationCodes.length).toBeGreaterThan(0);
      expect(userWithAuthCodes!.authorizationCodes[0].id).toBe(authCode.id);

      // Cleanup
      await prisma.authorizationCode.delete({ where: { id: authCode.id } });
      console.log('✅ User → AuthorizationCode relationship validated');
    });

    // UserSession model is deprecated/removed in favor of JWTs. This test is no longer valid.
    /*
    it('should create and validate User → UserSession relationship', async () => {
      const session = await prisma.userSession.create({
        data: {
          userId: testUser.id,
          sessionId: 'session_' + crypto.randomBytes(16).toString('hex'),
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          expiresAt: addDays(new Date(), 1),
          isActive: true,
        }
      })

      // Verify relationship
      const userWithSessions = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { sessions: true }
      })

      expect(userWithSessions).toBeTruthy()
      expect(userWithSessions!.sessions.length).toBeGreaterThan(0)
      expect(userWithSessions!.sessions[0].id).toBe(session.id)

      // Cleanup
      await prisma.userSession.delete({ where: { id: session.id } })
      console.log('✅ User → UserSession relationship validated')
    })
    */
  });

  describe('2. Client Entity Relationships', () => {
    it('should validate Client → AccessToken relationship', async () => {
      const accessToken = await prisma.accessToken.create({
        data: {
          token: 'client_access_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('test_client_token').digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          clientId: testClient.id,
          userId: testUser.id, // Added to satisfy schema constraint
          scope: 'client_credentials',
        },
      });

      // Verify relationship
      const clientWithTokens = await prisma.oAuthClient.findUnique({ // Corrected model name
        where: { id: testClient.id },
        include: { accessTokens: true },
      });

      expect(clientWithTokens).toBeTruthy();
      expect(clientWithTokens!.accessTokens.length).toBeGreaterThan(0);
      expect(clientWithTokens!.accessTokens.some((token) => token.id === accessToken.id)).toBe(
        true
      );

      // Cleanup
      await prisma.accessToken.delete({ where: { id: accessToken.id } });
      console.log('✅ Client → AccessToken relationship validated');
    });

    it('should validate Client → RefreshToken relationship', async () => {
      const refreshToken = await prisma.refreshToken.create({
        data: {
          token: 'client_refresh_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('test_client_refresh').digest('hex'),
          expiresAt: addDays(new Date(), 30),
          userId: testUser.id,
          clientId: testClient.id,
          scope: 'openid profile offline_access',
        },
      });

      // Verify relationship
      const clientWithRefreshTokens = await prisma.oAuthClient.findUnique({ // Corrected model name
        where: { id: testClient.id },
        include: { refreshTokens: true },
      });

      expect(clientWithRefreshTokens).toBeTruthy();
      expect(clientWithRefreshTokens!.refreshTokens.length).toBeGreaterThan(0);
      expect(
        clientWithRefreshTokens!.refreshTokens.some((token) => token.id === refreshToken.id)
      ).toBe(true);

      // Cleanup
      await prisma.refreshToken.delete({ where: { id: refreshToken.id } });
      console.log('✅ Client → RefreshToken relationship validated');
    });

    it('should validate Client → AuthorizationCode relationship', async () => {
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'client_auth_code_' + crypto.randomBytes(16).toString('hex'),
          expiresAt: addMinutes(new Date(), 10),
          redirectUri: 'http://localhost:3000/callback',
          userId: testUser.id,
          clientId: testClient.id,
          scope: 'openid profile',
          // state: 'test-state', // Removed: 'state' is not a field in AuthorizationCode model
        },
      });

      // Verify relationship
      const clientWithAuthCodes = await prisma.oAuthClient.findUnique({ // Corrected model name
        where: { id: testClient.id },
        include: { authorizationCodes: true },
      });

      expect(clientWithAuthCodes).toBeTruthy();
      expect(clientWithAuthCodes!.authorizationCodes.length).toBeGreaterThan(0);
      expect(clientWithAuthCodes!.authorizationCodes.some((code) => code.id === authCode.id)).toBe(
        true
      );

      // Cleanup
      await prisma.authorizationCode.delete({ where: { id: authCode.id } });
      console.log('✅ Client → AuthorizationCode relationship validated');
    });
  });

  // describe('3. UserResourcePermission Complex Relationships', () => { // REMOVED
    // This section is removed as UserResourcePermission and Resource models are not in the schema.
  // });

  describe('4. Audit Log Relationships', () => {
    it('should validate AuditLog → User relationship for user actions', async () => {
      const auditLogUserAction = await prisma.auditLog.create({
        data: {
          userId: testUser.id, // Direct relation
          actorType: 'USER',
          actorId: testUser.id,
          action: 'user_login_success',
          resourceType: 'user_session',
          status: 'SUCCESS',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          details: JSON.stringify({ loginMethod: 'password' }),
        },
      });

      // Verify relationships
      const logWithUser = await prisma.auditLog.findUnique({
        where: { id: auditLogUserAction.id },
        include: {
          user: true,
          // client: true, // Client is not a direct relation on AuditLog
        },
      });

      expect(logWithUser).toBeTruthy();
      expect(logWithUser!.user!.id).toBe(testUser.id);
      // expect(logWithUser!.client).toBeNull(); // No direct client relation here

      // Verify reverse relationship
      const userWithAuditLogs = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { auditLogs: true },
      });

      expect(userWithAuditLogs).toBeTruthy();
      expect(userWithAuditLogs!.auditLogs.some((log) => log.id === auditLogUserAction.id)).toBe(true);

      // Cleanup
      await prisma.auditLog.delete({ where: { id: auditLogUserAction.id } });
      console.log('✅ AuditLog → User relationship (user action) validated');
    });

    it('should validate AuditLog for client actions', async () => {
      const auditLogClientAction = await prisma.auditLog.create({
        data: {
          // userId: null, // No specific user for a pure client action
          actorType: 'CLIENT',
          actorId: testClient.id, // Using the oAuthClient.id
          action: 'client_credentials_grant',
          resourceType: 'oauth_token',
          status: 'SUCCESS',
          ipAddress: '192.168.1.100',
          userAgent: 'Client Service',
          details: JSON.stringify({ grantType: 'client_credentials' }),
        },
      });
       // Verify (no direct user or client relations to include from AuditLog for actorId)
      const logEntry = await prisma.auditLog.findUnique({
        where: { id: auditLogClientAction.id }
      });
      expect(logEntry).toBeTruthy();
      expect(logEntry!.actorId).toBe(testClient.id);
      expect(logEntry!.actorType).toBe('CLIENT');

      // Cleanup
      await prisma.auditLog.delete({ where: { id: auditLogClientAction.id } });
      console.log('✅ AuditLog for client actions validated');
    });
  });

  describe('5. Cascade Deletion Behavior', () => {
    it('should handle User deletion cascade', async () => {
      // Create a temporary user with related data
      const tempUser = await prisma.user.create({
        data: {
          username: 'temp-user-' + Date.now(),
          email: `temp-user-${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash('temp123', 12), // Corrected
          // emailVerified: true, // Removed
          isActive: true,
        },
      });

      // Verify reverse relationship
      const userWithAuditLogs = await prisma.user.findUnique({
        where: { id: testUser.id },
        include: { auditLogs: true },
      });

      expect(userWithAuditLogs).toBeTruthy();
      expect(userWithAuditLogs!.auditLogs.some((log) => log.id === auditLog.id)).toBe(true);

      // Cleanup
      await prisma.auditLog.delete({ where: { id: auditLog.id } });
      console.log('✅ AuditLog relationships validated');
    });
  });

  describe('5. Cascade Deletion Behavior', () => {
    it('should handle User deletion cascade', async () => {
      // Create a temporary user with related data
      const tempUser = await prisma.user.create({
        data: {
          username: 'temp-user-' + Date.now(),
          email: `temp-user-${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash('temp123', 12), // Corrected
          // emailVerified: true, // Removed
          isActive: true,
        },
      });

      // Create related data
      const tempAccessToken = await prisma.accessToken.create({
        data: {
          token: 'temp_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('temp_token').digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: tempUser.id,
          clientId: testClient.id,
          scope: 'openid profile',
        },
      });

      // UserSession model is deprecated/removed in favor of JWTs.
      /*
      const tempSession = await prisma.userSession.create({
        data: {
          userId: tempUser.id,
          sessionId: 'temp_session_' + crypto.randomBytes(16).toString('hex'),
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
          expiresAt: addDays(new Date(), 1),
          isActive: true,
        }
      })
      */

      // Delete user - should cascade
      await prisma.user.delete({ where: { id: tempUser.id } });

      // Verify cascaded deletions
      const remainingToken = await prisma.accessToken.findUnique({
        where: { id: tempAccessToken.id },
      });
      // UserSession model is deprecated/removed in favor of JWTs.
      // const remainingSession = await prisma.userSession.findUnique({
      //   where: { id: tempSession.id } // tempSession would be undefined here
      // })

      expect(remainingToken).toBeNull();
      // expect(remainingSession).toBeNull() // This check is no longer valid

      console.log('✅ User deletion cascade behavior validated (session part removed)');
    });

    it('should handle Client deletion cascade', async () => {
      // Create a temporary client with related data
      const tempClient = await prisma.oAuthClient.create({ // Corrected model name
        data: {
          clientId: 'temp-client-' + crypto.randomBytes(8).toString('hex'),
          clientSecret: await bcrypt.hash('temp-secret', 12),
          clientName: 'Temp Client', // Corrected field name
          clientType: 'CONFIDENTIAL', // Corrected field
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          grantTypes: JSON.stringify(['client_credentials']),
          responseTypes: JSON.stringify([]),
          allowedScopes: JSON.stringify(['test:read']), // Corrected field name
          isActive: true,
        },
      });

      // Create related data
      const tempAccessToken = await prisma.accessToken.create({
        data: {
          token: 'temp_client_token_' + crypto.randomBytes(16).toString('hex'),
          tokenHash: crypto.createHash('sha256').update('temp_client_token').digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser.id, // Added userId to satisfy schema
          clientId: tempClient.id,
          scope: 'test:read',
        },
      });

      // Delete client - should cascade
      await prisma.oAuthClient.delete({ where: { id: tempClient.id } }); // Corrected model name

      // Verify cascaded deletion
      const remainingToken = await prisma.accessToken.findUnique({
        where: { id: tempAccessToken.id },
      });

      expect(remainingToken).toBeNull();

      console.log('✅ Client deletion cascade behavior validated');
    });
  });

  describe('6. Unique Constraints Validation', () => {
    // UserResourcePermission unique constraint test removed as model does not exist.

    it('should enforce User email uniqueness', async () => {
      const email = `unique-test-${Date.now()}@example.com`;

      // Create first user
      const user1 = await prisma.user.create({
        data: {
          username: 'unique-user1-' + Date.now(),
          email,
          passwordHash: await bcrypt.hash('test123', 12), // Corrected
          // emailVerified: true, // Removed
          isActive: true,
        },
      });

      // Attempt to create user with same email - should fail
      await expect(
        prisma.user.create({
          data: {
            username: 'unique-user2-' + Date.now(),
            email, // Same email
            passwordHash: await bcrypt.hash('test123', 12), // Corrected
            // emailVerified: true, // Removed
            isActive: true,
          },
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.user.delete({ where: { id: user1.id } });
      console.log('✅ User email uniqueness constraint validated');
    });

    it('should enforce OAuthClient clientId uniqueness', async () => {
      const clientId = 'unique-client-' + Date.now();

      // Create first client
      const client1 = await prisma.oAuthClient.create({ // Corrected model name
        data: {
          clientId,
          clientSecret: await bcrypt.hash('secret', 12),
          clientName: 'Unique Client 1', // Corrected field name
          clientType: 'CONFIDENTIAL', // Corrected field
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          grantTypes: JSON.stringify(['client_credentials']),
          responseTypes: JSON.stringify([]),
          allowedScopes: JSON.stringify(['test:read']), // Corrected field name
          isActive: true,
        },
      });

      // Attempt to create client with same clientId - should fail
      await expect(
        prisma.oAuthClient.create({ // Corrected model name
          data: {
            clientId, // Same clientId
            clientSecret: await bcrypt.hash('secret', 12),
            clientName: 'Unique Client 2', // Corrected field name
            clientType: 'CONFIDENTIAL', // Corrected field
            redirectUris: JSON.stringify(['http://localhost:3000/callback']),
            grantTypes: JSON.stringify(['client_credentials']),
            responseTypes: JSON.stringify([]),
            allowedScopes: JSON.stringify(['test:read']), // Corrected field name
            isActive: true,
          },
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.oAuthClient.delete({ where: { id: client1.id } }); // Corrected model name
      console.log('✅ OAuthClient clientId uniqueness constraint validated');
    });
  });
});
