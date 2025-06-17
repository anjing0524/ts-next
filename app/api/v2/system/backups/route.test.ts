// app/api/v2/system/backups/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-backups-list-create-api');

describe('GET and POST /api/v2/system/backups', () => {
  let adminReadToken: string;
  let adminCreateToken: string;
  let adminNoPermToken: string;

  beforeAll(async () => {
    await setup();
    const adminUserRead = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'backupreadadmin', email: 'backupread@example.com' });
    const adminUserCreate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'backupcreateadmin', email: 'backupcreate@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'backupnopermadmin', email: 'backupnoperm@example.com' });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'system:backups:read', displayName: 'Read System Backups', resource: 'system:backups', action: 'read' });
    const createPerm = await dataManager.findOrCreatePermission({ name: 'system:backups:create', displayName: 'Create System Backups', resource: 'system:backups', action: 'create' });

    const adminRoleRead = await dataManager.createRole({ name: 'backup_reader_role', permissions: [readPerm.name] });
    const adminRoleCreate = await dataManager.createRole({ name: 'backup_creator_role', permissions: [createPerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'backup_no_perm_role', permissions: []});

    await dataManager.assignRoleToUser(adminUserRead.id!, adminRoleRead.id);
    await dataManager.assignRoleToUser(adminUserCreate.id!, adminRoleCreate.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-backups', name: 'Token Client Backups', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminReadToken = await dataManager.createAccessToken(adminUserRead.id!, tokenClient.clientId, 'openid system:backups:read', [readPerm.name]);
    adminCreateToken = await dataManager.createAccessToken(adminUserCreate.id!, tokenClient.clientId, 'openid system:backups:create', [createPerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid', []);
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/v2/system/backups', () => {
    it('should list (mock) backups successfully with system:backups:read permission (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(2); // Based on mock data in route
      expect(result.pagination).toBeDefined();
      expect(result.pagination.totalItems).toBe(2);
    });

    it('should respect pagination parameters for mock data', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups?page=1&limit=1', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.length).toBe(1);
      expect(result.pagination.pageSize).toBe(1);
    });

    it('should filter by type for mock data', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups?type=database_only', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      // The mock data includes one 'database_only' if type filter is applied in mock
      expect(result.data.some((b: any) => b.type === 'database_only')).toBe(true);
    });

    it('should return 403 for user without system:backups:read permission', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminNoPermToken);
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v2/system/backups', () => {
    it('should accept a backup creation request successfully (202)', async () => {
      const backupPayload = {
        type: 'full',
        description: 'Scheduled weekly backup',
      };
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(backupPayload),
      });
      expect(response.status).toBe(202);
      const result = await response.json();
      expect(result.backupId).toBeDefined();
      expect(result.statusUrl).toBeDefined();
      expect(result.message).toContain("Backup task type 'full' started successfully");
    });

    it('should accept a backup creation request with default type if body is empty or type omitted (202)', async () => {
      let response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify({ description: 'Default type backup' }), // Type omitted
      });
      expect(response.status).toBe(202);
      let result = await response.json();
      expect(result.message).toContain("Backup task type 'full' started successfully"); // Default type

      response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminCreateToken, {
        method: 'POST', // Empty body
      });
      expect(response.status).toBe(202);
      result = await response.json();
      expect(result.message).toContain("Backup task type 'full' started successfully");
    });

    it('should return 400 for invalid backup type in payload (if schema enforced stricter types)', async () => {
        const backupPayload = { type: 'invalid_backup_type' };
        const response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminCreateToken, {
            method: 'POST',
            body: JSON.stringify(backupPayload),
        });
        expect(response.status).toBe(400); // Zod validation for enum would fail
    });

    it('should return 403 for user without system:backups:create permission', async () => {
      const backupPayload = { type: 'full' };
      const response = await httpClient.authenticatedRequest('/api/v2/system/backups', adminNoPermToken, {
        method: 'POST',
        body: JSON.stringify(backupPayload),
      });
      expect(response.status).toBe(403);
    });
  });
});
