// app/api/v2/audit-logs/search/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client';
import { subDays, formatISO } from 'date-fns';


const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-logs-search-api');

describe('POST /api/v2/audit-logs/search', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userA: TestUser;
  let userB: TestUser;
  let clientA: TestClient;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditsearchadminA', email: 'auditsearchA@example.com' });
    userB = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'auditsearchuserB', email: 'auditsearchB@example.com' });

    clientA = await dataManager.createClient({
        clientId: 'audit-search-client-A', clientName: 'Audit Search Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditsearchsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const searchPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:search', displayName: 'Search Audit Logs', resource: 'auditlogs', action: 'search' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'another:perm', displayName: 'Another Perm', resource: 'another', action: 'perm'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_searcher_role', permissions: [searchPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_search_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(userA.id!, adminRoleWithPerm.id);
    const userNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditsearchadmin_noperm', email: 'auditsearchnoperm@example.com' });
    await dataManager.assignRoleToUser(userNoPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(userA.id!, clientA.clientId, 'openid auditlogs:search', [searchPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userNoPerm.id!, clientA.clientId, 'openid another:perm', [otherPerm.name]);

    // Create diverse sample audit logs
    await prisma.auditLog.createMany({
      data: [
        { userId: userA.id, action: 'USER_LOGIN_SUCCESS', success: true, ipAddress: '127.0.0.1', actorType: 'USER', actorId: userA.id!, resourceType: 'USER', resourceId: userA.id!, details: 'User A logged in from home.' , timestamp: subDays(new Date(), 2)},
        { userId: userB.id, action: 'FILE_UPLOAD_FAILED', success: false, ipAddress: '192.168.1.100', actorType: 'USER', actorId: userB.id!, resourceType: 'FILE', resourceId: 'file123.txt', details: 'Upload failed due to network error.', timestamp: subDays(new Date(), 1) },
        { clientId: clientA.id, action: 'CLIENT_TOKEN_ISSUED', success: true, ipAddress: '10.0.0.5', actorType: 'CLIENT', actorId: clientA.clientId, resourceType: 'TOKEN', details: 'Client A obtained a token.', timestamp: new Date() },
        { action: 'SYSTEM_MAINTENANCE_START', success: true, actorType: 'SYSTEM', actorId: 'cron:maintenance', resourceType: 'SYSTEM', details: 'Maintenance window started.', timestamp: subDays(new Date(), 3) },
        { userId: userA.id, action: 'USER_PROFILE_UPDATE', success: true, ipAddress: '127.0.0.1', actorType: 'USER', actorId: userA.id!, resourceType: 'USER', resourceId: userA.id!, details: 'User A updated their profile display name.', timestamp: subDays(new Date(), 0.5) },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{userId: userA.id}, {userId: userB.id}, {clientId: clientA.id}, {action: {contains: 'SYSTEM_MAINTENANCE'}}, {action: {contains: 'LOGIN'}}  ]} });
    await cleanup();
  });

  it('should search audit logs with a general query string (200)', async () => {
    const searchPayload = { query: 'User A logged in' };
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((log: AuditLog) => log.details?.includes('User A logged in'))).toBe(true);
    expect(result.pagination).toBeDefined();
  });

  it('should filter by userId', async () => {
    const searchPayload = { userId: userB.id };
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((log: AuditLog) => expect(log.userId).toBe(userB.id));
  });

  it('should filter by action (case-insensitive contains)', async () => {
    const searchPayload = { action: 'login' }; // Should match USER_LOGIN_SUCCESS
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some((log: AuditLog) => log.action.toLowerCase().includes('login'))).toBe(true);
  });

  it('should filter by date range', async () => {
    const searchPayload = {
      startDate: formatISO(subDays(new Date(), 1.5)), // From 1.5 days ago
      endDate: formatISO(subDays(new Date(), 0.25)), // Until 0.25 days ago
    };
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    // Should find FILE_UPLOAD_FAILED and USER_PROFILE_UPDATE
    expect(result.data.length).toBe(2);
    expect(result.data.some((log: AuditLog) => log.action === 'FILE_UPLOAD_FAILED')).toBe(true);
    expect(result.data.some((log: AuditLog) => log.action === 'USER_PROFILE_UPDATE')).toBe(true);
  });

  it('should return 400 for invalid payload (e.g., bad date format, invalid CUID for userId)', async () => {
    const searchPayload = { startDate: 'not-a-date' };
    let response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(400);

    const searchPayload2 = { userId: 'not-a-cuid' };
    response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload2),
    });
    expect(response.status).toBe(400);
  });


  it('should return 403 for user without auditlogs:search permission', async () => {
    const searchPayload = { query: 'anything' };
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/search', adminTokenWithoutPerm, {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const searchPayload = { query: 'anything' };
    const response = await httpClient.makeRequest('/api/v2/audit-logs/search', {
      method: 'POST',
      body: JSON.stringify(searchPayload),
    });
    expect(response.status).toBe(401);
  });
});
