// app/api/v2/audit-logs/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client'; // Import Prisma types

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-logs-list-api');

describe('GET /api/v2/audit-logs', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userA: TestUser;
  let userB: TestUser;
  let clientA: TestClient;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditadminA', email: 'auditadminA@example.com' });
    userB = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'audituserB', email: 'audituserB@example.com' });

    clientA = await dataManager.createClient({
        clientId: 'audit-client-A', clientName: 'Audit Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const listPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:list', displayName: 'List Audit Logs', resource: 'auditlogs', action: 'list' });
    const noPerm = await dataManager.findOrCreatePermission({ name: 'other:perm', displayName: 'Other Perm', resource: 'other', action: 'perm'});


    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_lister_role', permissions: [listPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_list_role', permissions: [noPerm.name] });

    await dataManager.assignRoleToUser(userA.id!, adminRoleWithPerm.id);
    await dataManager.assignRoleToUser(userB.id!, adminRoleWithoutPerm.id); // User B has a role, but not the right perm

    adminTokenWithPerm = await dataManager.createAccessToken(userA.id!, clientA.clientId, 'openid auditlogs:list', [listPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userB.id!, clientA.clientId, 'openid other:perm', [noPerm.name]);

    // Create sample audit logs
    await prisma.auditLog.createMany({
      data: [
        { userId: userA.id, action: 'user_login', success: true, ipAddress: '127.0.0.1', actorType: 'USER', actorId: userA.id! },
        { userId: userB.id, action: 'file_upload', success: false, ipAddress: '192.168.1.1', actorType: 'USER', actorId: userB.id! },
        { clientId: clientA.id, action: 'client_credentials_token', success: true, ipAddress: '10.0.0.1', actorType: 'CLIENT', actorId: clientA.clientId },
        { action: 'system_event', success: true, actorType: 'SYSTEM', actorId: 'cronjob' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{userId: userA.id}, {userId: userB.id}, {clientId: clientA.id}, {action: 'system_event'}]} });
    await cleanup();
  });

  it('should list audit logs successfully for an admin with auditlogs:list permission (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(4); // At least the 4 created ones
    expect(result.pagination).toBeDefined();
    expect(result.pagination.totalItems).toBeGreaterThanOrEqual(4);
    expect(result.pagination.currentPage).toBe(1);
    expect(result.pagination.pageSize).toBe(10); // Default page size
  });

  it('should filter audit logs by userId', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs?userId=${userA.id}`, adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((log: AuditLog) => {
      expect(log.userId).toBe(userA.id);
    });
  });

  it('should filter audit logs by action (case-insensitive)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs?action=USER_LOGIN`, adminTokenWithPerm); // Uppercase
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((log: AuditLog) => {
      expect(log.action.toLowerCase()).toContain('user_login');
    });
  });

  it('should filter by success status', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs?success=false`, adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((log: AuditLog) => {
      expect(log.success).toBe(false);
    });
  });

  it('should respect pagination parameters (page, limit)', async () => {
    const responsePage1 = await httpClient.authenticatedRequest('/api/v2/audit-logs?page=1&limit=2', adminTokenWithPerm);
    expect(responsePage1.status).toBe(200);
    const page1Data = await responsePage1.json();
    expect(page1Data.data.length).toBe(2);
    expect(page1Data.pagination.page).toBe(1);
    expect(page1Data.pagination.pageSize).toBe(2);

    const responsePage2 = await httpClient.authenticatedRequest('/api/v2/audit-logs?page=2&limit=2', adminTokenWithPerm);
    expect(responsePage2.status).toBe(200);
    const page2Data = await responsePage2.json();
    expect(page2Data.data.length).toBeGreaterThanOrEqual(0); // Could be less than page size on last page
    expect(page2Data.pagination.page).toBe(2);
  });

  it('should return 403 for user without auditlogs:list permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/audit-logs');
    expect(response.status).toBe(401);
  });
});
