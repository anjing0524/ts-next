// app/api/v2/audit-logs/statistics/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client';
import { subDays, addHours, startOfDay, endOfDay, formatISO } from 'date-fns';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-logs-stats-api');

describe('GET /api/v2/audit-logs/statistics', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditstatsadminA', email: 'auditstatsA@example.com' });
    userB = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'auditstatsuserB', email: 'auditstatsB@example.com' });

    const clientA = await dataManager.createClient({
        clientId: 'audit-stats-client-A', clientName: 'Audit Stats Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditstatssecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const statsPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:read:statistics', displayName: 'Read Audit Log Stats', resource: 'auditlogs', action: 'read:statistics' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'nostats:perm', displayName: 'No Stats Perm', resource: 'nostats', action: 'perm'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_stats_reader_role', permissions: [statsPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_stats_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(userA.id!, adminRoleWithPerm.id);
    const userNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditstatsadmin_noperm', email: 'auditstatsnoperm@example.com' });
    await dataManager.assignRoleToUser(userNoPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(userA.id!, clientA.clientId, 'openid auditlogs:read:statistics', [statsPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userNoPerm.id!, clientA.clientId, 'openid nostats:perm', [otherPerm.name]);

    // Create sample audit logs for statistics
    await prisma.auditLog.createMany({
      data: [
        // Today's events
        { userId: userA.id, action: 'LOGIN_SUCCESS', success: true, actorType: 'USER', actorId: userA.id!, timestamp: new Date() },
        { userId: userB.id, action: 'PROFILE_UPDATE', success: true, actorType: 'USER', actorId: userB.id!, timestamp: subDays(new Date(), 0.5) }, // Still within last 24h
        // Yesterday's events
        { userId: userA.id, action: 'LOGIN_SUCCESS', success: true, actorType: 'USER', actorId: userA.id!, timestamp: subDays(new Date(), 1) },
        { userId: userB.id, action: 'LOGIN_FAILED', success: false, actorType: 'USER', actorId: userB.id!, timestamp: subDays(new Date(), 1.5) },
        // Events from 5 days ago
        { userId: userA.id, action: 'ITEM_DELETED', success: true, actorType: 'USER', actorId: userA.id!, timestamp: subDays(new Date(), 5) },
        // Events from 15 days ago
        { userId: userB.id, action: 'CONFIG_UPDATED', success: true, actorType: 'USER', actorId: userB.id!, timestamp: subDays(new Date(), 15) },
         // Event by System
        { action: 'SYSTEM_BACKUP', success: true, actorType: 'SYSTEM', actorId: 'backup_service', timestamp: subDays(new Date(), 2) },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{userId: userA.id}, {userId: userB.id}, {actorType: 'SYSTEM'}]} });
    await cleanup();
  });

  it('should return statistics for default period (24h) successfully', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/statistics', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const stats = await response.json();

    expect(stats.period.requested).toBe('24h');
    expect(stats.totalEvents).toBeGreaterThanOrEqual(2); // LOGIN_SUCCESS (today), PROFILE_UPDATE (today by userB)
    expect(stats.eventsByActionType['LOGIN_SUCCESS']).toBeGreaterThanOrEqual(1);
    expect(stats.eventsByActionType['PROFILE_UPDATE']).toBeGreaterThanOrEqual(1);
    expect(stats.eventsByUser.length).toBeGreaterThanOrEqual(1); // At least userA or userB
    expect(stats.eventsOverTime.length).toBeGreaterThanOrEqual(1); // At least one day entry
  });

  it('should return statistics for 7d period', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/statistics?period=7d', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const stats = await response.json();
    expect(stats.period.requested).toBe('7d');
    expect(stats.totalEvents).toBeGreaterThanOrEqual(5); // 2 today, 2 yesterday, 1 five days ago, 1 two days ago (system)
  });

  it('should return statistics for custom date range', async () => {
    const dateFrom = formatISO(startOfDay(subDays(new Date(), 2))); // Start of 2 days ago
    const dateTo = formatISO(endOfDay(subDays(new Date(), 1)));   // End of yesterday

    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/statistics?period=custom&dateFrom=${dateFrom}&dateTo=${dateTo}`, adminTokenWithPerm);
    expect(response.status).toBe(200);
    const stats = await response.json();

    expect(stats.period.requested).toBe('custom');
    // Expecting 2 from yesterday + 1 system event from 2 days ago = 3
    expect(stats.totalEvents).toBe(3);
    expect(stats.eventsByActionType['LOGIN_SUCCESS']).toBe(1);
    expect(stats.eventsByActionType['LOGIN_FAILED']).toBe(1);
    expect(stats.eventsByActionType['SYSTEM_BACKUP']).toBe(1);
  });

  it('should return 400 if period is custom but dateFrom or dateTo is missing', async () => {
    let response = await httpClient.authenticatedRequest('/api/v2/audit-logs/statistics?period=custom&dateFrom=2023-01-01T00:00:00Z', adminTokenWithPerm);
    expect(response.status).toBe(400);
    let error = await response.json();
    expect(error.message).toContain("For 'custom' period, 'dateFrom' and 'dateTo' are required");

    response = await httpClient.authenticatedRequest('/api/v2/audit-logs/statistics?period=custom&dateTo=2023-01-01T00:00:00Z', adminTokenWithPerm);
    expect(response.status).toBe(400);
    error = await response.json();
    expect(error.message).toContain("For 'custom' period, 'dateFrom' and 'dateTo' are required");
  });

  it('should return 400 if dateTo is earlier than dateFrom for custom period', async () => {
    const dateFrom = formatISO(new Date());
    const dateTo = formatISO(subDays(new Date(), 1));
    const response = await httpClient.authenticatedRequest(`/api/v2/audit-logs/statistics?period=custom&dateFrom=${dateFrom}&dateTo=${dateTo}`, adminTokenWithPerm);
    expect(response.status).toBe(400);
     const error = await response.json();
    expect(error.message).toContain("'dateTo' must not be earlier than 'dateFrom'");
  });

  it('should return 403 for user without auditlogs:read:statistics permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/statistics', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/audit-logs/statistics');
    expect(response.status).toBe(401);
  });
});
