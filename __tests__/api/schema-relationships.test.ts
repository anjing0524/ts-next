import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { addMinutes, addDays } from 'date-fns';

describe('数据库模式关系完整性测试 / Database Schema Relationships Integrity Tests', () => {
  let testUser: any = null;
  let testUser2: any = null;
  let testClient: any = null;
  let testResource: any = null;
  let testPermission: any = null;
  let testScope: any = null;
  let testDataSuffix: string;

  beforeAll(async () => {
    testDataSuffix = Date.now().toString() + '-' + crypto.randomBytes(4).toString('hex');
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function setupTestData(): Promise<void> {
    await cleanupExistingTestData();
    const password = await bcrypt.hash('SchemaTest123!', 12);
    testUser = await prisma.user.create({
      data: { username: 'schema-user1-' + testDataSuffix, email: `schema-user1-${testDataSuffix}@example.com`, passwordHash: password, isActive: true, firstName: 'Schema', lastName: 'User1' },
    });
    testUser2 = await prisma.user.create({
      data: { username: 'schema-user2-' + testDataSuffix, email: `schema-user2-${testDataSuffix}@example.com`, passwordHash: password, isActive: true, firstName: 'Schema', lastName: 'User2' },
    });
    testClient = await prisma.oAuthClient.create({
      data: {
        clientId: 'schema-client-' + testDataSuffix, clientSecret: await bcrypt.hash('schema-secret', 12), clientName: `Schema Test Client ${testDataSuffix}`, clientType: 'CONFIDENTIAL',
        redirectUris: JSON.stringify(['http://localhost:3000/callback']), grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
        responseTypes: JSON.stringify(['code']), allowedScopes: JSON.stringify('openid profile email test:read test:write'.split(' ')), isActive: true,
      },
    });
    testResource = null;
    testPermission = await prisma.permission.create({
      data: { name: `SCHEMA_TEST_PERMISSION_${testDataSuffix}`, displayName: `Test Display Permission ${testDataSuffix}`, description: 'Test permission for schema validation', resource: `test_resource_perm_${testDataSuffix}`, action: 'read', isActive: true },
    });
    testScope = await prisma.scope.create({
      data: { name: `schema:test:${testDataSuffix}`, description: 'Test scope for schema validation', isActive: true, isPublic: false },
    });
  }

  async function cleanupExistingTestData(): Promise<void> {
    await prisma.permission.deleteMany({ where: { name: { startsWith: 'SCHEMA_TEST_PERMISSION' } } }).catch(() => {});
    await prisma.scope.deleteMany({ where: { name: { startsWith: 'schema:test' } } }).catch(() => {});
    await prisma.oAuthClient.deleteMany({ where: { clientId: { startsWith: 'schema-client-' } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { startsWith: 'schema-user' } } }).catch(() => {});
  }

  async function cleanupTestData(): Promise<void> {
    await prisma.accessToken.deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } }).catch(() => {});
    await prisma.refreshToken.deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } }).catch(() => {});
    await prisma.authorizationCode.deleteMany({ where: { OR: [{userId: testUser?.id}, {clientId: testClient?.id}] } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { OR: [ { userId: testUser?.id }, { userId: testUser2?.id }, { actorId: testClient?.id, actorType: 'CLIENT' } ] } }).catch(() => {});
    if (testScope?.id) await prisma.scope.delete({ where: { id: testScope.id } }).catch(() => {});
    if (testPermission?.id) await prisma.permission.delete({ where: { id: testPermission.id } }).catch(() => {});
    if (testClient?.id) await prisma.oAuthClient.delete({ where: { id: testClient.id } }).catch(() => {});
    if (testUser?.id) await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    if (testUser2?.id) await prisma.user.delete({ where: { id: testUser2.id } }).catch(() => {});
    await cleanupExistingTestData();
  }

  describe('1. 用户实体关系 / User Entity Relationships', () => {
    it('TC_SR_001_001: 应创建并验证用户与AccessToken的关系 / Should create and validate User → AccessToken relationship', async () => {
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
    });

    it('TC_SR_001_002: 应创建并验证用户与RefreshToken的关系 / Should create and validate User → RefreshToken relationship', async () => {
      const refreshToken = await prisma.refreshToken.create({
        data: {
          token: 'user_refresh_token_sr_' + crypto.randomBytes(16).toString('hex'), // Added _sr for uniqueness
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
    });

    it('TC_SR_001_003: 应创建并验证用户与AuthorizationCode的关系 / Should create and validate User → AuthorizationCode relationship', async () => {
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'user_auth_code_sr_' + crypto.randomBytes(16).toString('hex'), // Added _sr for uniqueness
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
    });

    // UserSession model is deprecated/removed.
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
    })
    */
  });

  describe('2. 客户端实体关系 / Client Entity Relationships', () => {
    it('TC_SR_002_001: 应验证客户端与AccessToken的关系 / Should validate Client → AccessToken relationship', async () => {
      const accessToken = await prisma.accessToken.create({
        data: {
          token: 'client_access_token_sr_' + crypto.randomBytes(16).toString('hex'), // Added _sr
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
    });

    it('TC_SR_002_002: 应验证客户端与RefreshToken的关系 / Should validate Client → RefreshToken relationship', async () => {
      const refreshToken = await prisma.refreshToken.create({
        data: {
          token: 'client_refresh_token_sr_' + crypto.randomBytes(16).toString('hex'), // Added _sr
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
    });

    it('TC_SR_002_003: 应验证客户端与AuthorizationCode的关系 / Should validate Client → AuthorizationCode relationship', async () => {
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'client_auth_code_sr_' + crypto.randomBytes(16).toString('hex'), // Added _sr
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
    });
  });

  // UserResourcePermission and Resource models are not in the schema.
  // describe('3. 用户资源权限复杂关系 / UserResourcePermission Complex Relationships', () => { // REMOVED
  // });

  describe('4. 审计日志关系 / Audit Log Relationships', () => {
    it('TC_SR_004_001: 用户操作应验证审计日志与用户的关系 / Should validate AuditLog → User relationship for user actions', async () => {
      const auditLogUserAction = await prisma.auditLog.create({
        data: {
          userId: testUser.id,
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
    });

    it('TC_SR_004_002: 客户端操作应验证审计日志 / Should validate AuditLog for client actions', async () => {
      const auditLogClientAction = await prisma.auditLog.create({
        data: {
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
    });
  });


  // This describe block seems to be duplicated, I will merge its content into the one above if unique,
  // or remove if it's an exact duplicate.
  // describe('5. Audit Log Relationships', () => { ... }); // Removing this apparent duplicate

  describe('5. 级联删除行为 / Cascade Deletion Behavior', () => {
    it('TC_SR_005_001: 应处理用户删除级联 / Should handle User deletion cascade', async () => {
      const tempUser = await prisma.user.create({
        data: {
          username: 'temp-user-cascade-' + Date.now(), // Unique username
          email: `temp-user-cascade-${Date.now()}@example.com`,
          passwordHash: await bcrypt.hash('tempcascade123', 12),
          isActive: true,
        },
      });

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
    });

    it('TC_SR_005_002: 应处理客户端删除级联 / Should handle Client deletion cascade', async () => {
      const tempClient = await prisma.oAuthClient.create({
        data: {
          clientId: 'temp-client-cascade-' + crypto.randomBytes(8).toString('hex'), // Unique clientId
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
    });
  });

  describe('6. 唯一约束验证 / Unique Constraints Validation', () => {
    it('TC_SR_006_001: 应强制用户邮箱唯一性 / Should enforce User email uniqueness', async () => {
      const email = `unique-test-sr-${Date.now()}@example.com`;
      const user1 = await prisma.user.create({
        data: { username: 'unique-user1-sr-' + Date.now(), email, passwordHash: await bcrypt.hash('test123sr', 12), isActive: true },
      });
      await expect(
        prisma.user.create({
          data: { username: 'unique-user2-sr-' + Date.now(), email, passwordHash: await bcrypt.hash('test123sr', 12), isActive: true },
        })
      ).rejects.toThrow();
      await prisma.user.delete({ where: { id: user1.id } });
    });

    it('TC_SR_006_002: 应强制OAuthClient clientId唯一性 / Should enforce OAuthClient clientId uniqueness', async () => {
      const clientId = 'unique-client-sr-' + Date.now();
      const client1 = await prisma.oAuthClient.create({
        data: {
          clientId, clientSecret: await bcrypt.hash('secret', 12), clientName: 'Unique SR Client 1', clientType: 'CONFIDENTIAL',
          redirectUris: JSON.stringify(['http://localhost:3000/callback']), grantTypes: JSON.stringify(['client_credentials']),
          responseTypes: JSON.stringify([]), allowedScopes: JSON.stringify(['test:read']), isActive: true,
        },
      });
      await expect(
        prisma.oAuthClient.create({
          data: {
            clientId, clientSecret: await bcrypt.hash('secret', 12), clientName: 'Unique SR Client 2', clientType: 'CONFIDENTIAL',
            redirectUris: JSON.stringify(['http://localhost:3000/callback']), grantTypes: JSON.stringify(['client_credentials']),
            responseTypes: JSON.stringify([]), allowedScopes: JSON.stringify(['test:read']), isActive: true,
          },
        })
      ).rejects.toThrow();
      await prisma.oAuthClient.delete({ where: { id: client1.id } });
    });
  });
});
