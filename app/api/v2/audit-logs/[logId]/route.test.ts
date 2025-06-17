// app/api/v2/audit-logs/[logId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-log-detail-api');

describe('GET /api/v2/audit-logs/{logId}', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userA: TestUser;
  let sampleLog: AuditLog;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditdetailadmin', email: 'auditdetail@example.com' });

    const clientA = await dataManager.createClient({
        clientId: 'audit-detail-client-A', clientName: 'Audit Detail Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditdetailsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:read', displayName: 'Read Audit Logs', resource: 'auditlogs', action: 'read' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'unrelated:perm', displayName: 'Unrelated Perm', resource: 'unrelated', action: 'perm'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_reader_role', permissions: [readPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_read_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(userA.id!, adminRoleWithPerm.id);
    // Create another admin user for no-perm test, to avoid role/perm conflicts if dataManager reuses users based on type
    const userB = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditdetailadmin_noperm', email: 'auditdetailnoperm@example.com' });
    await dataManager.assignRoleToUser(userB.id!, adminRoleWithoutPerm.id);


    adminTokenWithPerm = await dataManager.createAccessToken(userA.id!, clientA.clientId, 'openid auditlogs:read', [readPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userB.id!, clientA.clientId, 'openid unrelated:perm', [otherPerm.name]);

    // Create a sample audit log
    sampleLog = await prisma.auditLog.create({
      data: {
        userId: userA.id,
        action: 'test_log_retrieval',
        success: true,
        ipAddress: '127.0.0.1',
        actorType: 'USER',
        actorId: userA.id!,
        resourceType: 'TestResource',
        resourceId: 'res123',
        details: '{ "key": "value" }',
      },
    });
  });

  afterAll(async () => {
    if(sampleLog) await prisma.auditLog.deleteMany({ where: { id: sampleLog.id } });
    await cleanup();
  });

  it('should retrieve an existing audit log successfully with auditlogs:read permission (200)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/${sampleLog.id}`, adminTokenWithPerm);
    expect(response.status).toBe(200);
    const logEntry = await response.json();

    expect(logEntry.id).toBe(sampleLog.id);
    expect(logEntry.action).toBe('test_log_retrieval');
    expect(logEntry.userId).toBe(userA.id);
    expect(logEntry.success).toBe(true);
  });

  it('should return 404 for a non-existent log ID', async () => {
    const nonExistentLogId = 'clnonexistentlog123'; // Prisma default CUID/UUID format for AuditLog is UUID
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/${nonExistentLogId}`, adminTokenWithPerm);
    expect(response.status).toBe(404);
    const error = await response.json();
    expect(error.message).toContain('Audit log entry not found');
  });

  it('should return 400 for an invalid log ID format (not CUID/UUID)', async () => {
    const invalidLogId = 'not-a-uuid-or-cuid';
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/${invalidLogId}`, adminTokenWithPerm);
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Invalid Log ID format');
  });


  it('should return 403 for user without auditlogs:read permission', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/${sampleLog.id}`, adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest(`/api/v2/audit-logs/${sampleLog.id}`);
    expect(response.status).toBe(401);
  });
});
