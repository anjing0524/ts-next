// app/api/v2/audit-logs/compliance-reports/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client';
import { subDays, formatISO, startOfDay, endOfDay } from 'date-fns';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-compliance-api');

describe('GET /api/v2/audit-logs/compliance-reports', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userForReport: TestUser;
  let otherUser: TestUser;

  beforeAll(async () => {
    await setup();
    userForReport = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditreportuserA', email: 'auditreportA@example.com' });
    otherUser = await dataManager.createUser({ ...TEST_USERS.REGULAR, username: 'auditreportuserB', email: 'auditreportB@example.com' });

    const clientA = await dataManager.createClient({
        clientId: 'audit-report-client-A', clientName: 'Audit Report Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditreportsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const reportPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:read:compliance', displayName: 'Read Audit Compliance Reports', resource: 'auditlogs', action: 'read:compliance' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'nopermission:compliance', displayName: 'No Compliance Perm', resource: 'nopermission', action: 'compliance'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_report_reader_role', permissions: [reportPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_report_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(userForReport.id!, adminRoleWithPerm.id); // User A can make the call
    const userNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditreportadmin_noperm', email: 'auditreportnoperm@example.com' });
    await dataManager.assignRoleToUser(userNoPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(userForReport.id!, clientA.clientId, 'openid auditlogs:read:compliance', [reportPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userNoPerm.id!, clientA.clientId, 'openid nopermission:compliance', [otherPerm.name]);

    // Create sample audit logs
    await prisma.auditLog.createMany({
      data: [
        // For userForReport
        { userId: userForReport.id, action: 'USER_LOGIN_SUCCESS', success: true, actorType: 'USER', actorId: userForReport.id!, timestamp: subDays(new Date(), 1)},
        { userId: userForReport.id, action: 'USER_LOGIN_FAILED', success: false, actorType: 'USER', actorId: userForReport.id!, timestamp: subDays(new Date(), 2)},
        { userId: userForReport.id, action: 'PASSWORD_RESET_REQUEST', success: true, actorType: 'USER', actorId: userForReport.id!, timestamp: subDays(new Date(), 0.5)}, // Today
        // For otherUser
        { userId: otherUser.id, action: 'USER_LOGIN_SUCCESS', success: true, actorType: 'USER', actorId: otherUser.id!, timestamp: subDays(new Date(), 1)},
        // Other types of logs
        { action: 'SYSTEM_CONFIG_UPDATED', success: true, actorType: 'SYSTEM', actorId: 'system', timestamp: subDays(new Date(), 3) },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{userId: userForReport.id}, {userId: otherUser.id}, {action: 'SYSTEM_CONFIG_UPDATED'}]} });
    await cleanup();
  });

  it('should generate USER_LOGIN_HISTORY report as JSON successfully', async () => {
    const dateFrom = formatISO(startOfDay(subDays(new Date(), 3)));
    const dateTo = formatISO(endOfDay(new Date()));
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&targetUserId=${userForReport.id}&format=json&dateFrom=${dateFrom}&dateTo=${dateTo}`;

    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Content-Disposition')).toContain(`attachment; filename="USER_LOGIN_HISTORY_`);

    const logs = await response.json();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(3); // LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_RESET_REQUEST for userForReport
    logs.forEach((log: AuditLog) => {
        expect(log.userId).toBe(userForReport.id);
        expect(['USER_LOGIN_SUCCESS', 'USER_LOGIN_FAILED', 'PASSWORD_RESET_REQUEST']).toContain(log.action);
    });
  });

  it('should generate USER_LOGIN_HISTORY report as CSV successfully', async () => {
    const dateFrom = formatISO(startOfDay(subDays(new Date(), 3)));
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&targetUserId=${userForReport.id}&format=csv&dateFrom=${dateFrom}`;

    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain(`attachment; filename="USER_LOGIN_HISTORY_`);

    const csvText = await response.text();
    // Check for headers based on 'reportFields' in the route
    expect(csvText).toContain('id,timestamp,action,success,ipAddress,userAgent,details');
    expect(csvText).toContain('USER_LOGIN_SUCCESS');
    expect(csvText).toContain('USER_LOGIN_FAILED');
    expect(csvText).toContain(userForReport.id); // Check if userId is in the CSV
  });

  it('should return 400 if reportType is USER_LOGIN_HISTORY but targetUserId is missing', async () => {
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&format=json`;
    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('targetUserId is required for USER_LOGIN_HISTORY report');
  });

  it('should return 501 for an unimplemented reportType (e.g., PERMISSION_CHANGES)', async () => {
    const url = `/api/v2/audit-logs/compliance-reports?reportType=PERMISSION_CHANGES&format=json`;
    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(501);
     const result = await response.json();
    expect(result.message).toContain("Report type 'PERMISSION_CHANGES' is not yet implemented.");
  });

  it('should return 400 for invalid query parameters (e.g., bad date format)', async () => {
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&targetUserId=${userForReport.id}&dateFrom=not-a-date`;
    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(400);
  });

  it('should return 403 for user without auditlogs:read:compliance permission', async () => {
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&targetUserId=${userForReport.id}`;
    const response = await httpClient.authenticatedRequest(url, adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const url = `/api/v2/audit-logs/compliance-reports?reportType=USER_LOGIN_HISTORY&targetUserId=${userForReport.id}`;
    const response = await httpClient.makeRequest(url);
    expect(response.status).toBe(401);
  });
});
