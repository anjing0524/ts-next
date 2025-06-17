// app/api/v2/system/backups/[backupId]/restore/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-backup-restore-api');

describe('POST /api/v2/system/backups/{backupId}/restore', () => {
  let adminRestoreToken: string;
  let adminNoPermToken: string;
  const validBackupId = 'backup_abc123_valid';
  const nonExistentBackupId = 'non_existent_backup_id_for_test'; // Matches logic in route

  beforeAll(async () => {
    await setup();
    const adminUserRestore = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'backuprestoreadmin', email: 'backuprestore@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'backuprestorenoperm', email: 'backuprestorenoperm@example.com' });

    const restorePerm = await dataManager.findOrCreatePermission({ name: 'system:backups:restore', displayName: 'Restore System Backups', resource: 'system:backups', action: 'restore' });

    const adminRoleRestore = await dataManager.createRole({ name: 'backup_restorer_role', permissions: [restorePerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'backup_restore_no_perm_role', permissions: []});

    await dataManager.assignRoleToUser(adminUserRestore.id!, adminRoleRestore.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-backup-restore', name: 'Token Client Backup Restore', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminRestoreToken = await dataManager.createAccessToken(adminUserRestore.id!, tokenClient.clientId, 'openid system:backups:restore', [restorePerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid', []);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should accept a restore request for a valid backupId successfully (202)', async () => {
    const restorePayload = {
      overwriteExistingData: true,
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/system/backups/${validBackupId}/restore`, adminRestoreToken, {
      method: 'POST',
      body: JSON.stringify(restorePayload),
    });
    expect(response.status).toBe(202);
    const result = await response.json();
    expect(result.taskId).toBeDefined();
    expect(result.message).toContain(`System restore from backup ${validBackupId} initiated`);
  });

  it('should accept a restore request with empty body (default options)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/system/backups/${validBackupId}/restore`, adminRestoreToken, {
      method: 'POST', // Empty body implies default options
    });
    expect(response.status).toBe(202);
    const result = await response.json();
    expect(result.taskId).toBeDefined();
  });

  it('should return 404 for a non-existent backupId', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/system/backups/${nonExistentBackupId}/restore`, adminRestoreToken, {
      method: 'POST',
    });
    expect(response.status).toBe(404);
    const error = await response.json();
    expect(error.message).toContain('Backup with ID non_existent_backup_id_for_test not found');
  });

  it('should return 400 for an invalid backupId format (e.g., empty string in path)', async () => {
    // Note: Next.js routing might catch an empty path segment before the handler,
    // but this tests if the handler itself has validation for a programmatically empty backupId.
    // The current handler validates this.
    const response = await httpClient.authenticatedRequest(`/api/v2/system/backups/ /restore`, adminRestoreToken, { // Space in backupId or empty
      method: 'POST',
    });
    // Depending on how server/framework handles invalid URL path segments, this might be 404 or 400 from handler.
    // The handler has a basic check for non-empty string.
    expect(response.status).toBe(400); // Or 404 if routing catches it first.
                                       // Current route logic has: if (!backupId || typeof backupId !== 'string' || backupId.trim() === '')
  });


  it('should return 403 for user without system:backups:restore permission', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/system/backups/${validBackupId}/restore`, adminNoPermToken, {
      method: 'POST',
    });
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest(`/api/v2/system/backups/${validBackupId}/restore`, {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });
});
