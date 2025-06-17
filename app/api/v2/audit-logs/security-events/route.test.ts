// app/api/v2/audit-logs/security-events/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, AuditLog } from '@prisma/client';
import { subDays, formatISO } from 'date-fns';

// Predefined security event actions from the route implementation
const SECURITY_EVENT_ACTIONS: string[] = [
  'USER_LOGIN_FAILED', 'USER_LOGIN_SUCCESS',
  'USER_PASSWORD_CHANGED', 'USER_PASSWORD_RESET_REQUEST', 'USER_PASSWORD_RESET_SUCCESS',
  'USER_ACCOUNT_LOCKED', 'USER_ACCOUNT_UNLOCKED',
  'ROLE_PERMISSION_ASSIGNED', 'ROLE_PERMISSION_REMOVED',
  'USER_ROLE_ASSIGNED', 'USER_ROLE_REMOVED',
  'CLIENT_SECRET_REGENERATED', 'CLIENT_CREATED', 'CLIENT_DELETED',
  'TOKEN_REVOKED_REFRESH', 'TOKEN_REVOKED_ACCESS',
];

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('audit-security-events-api');

describe('GET /api/v2/audit-logs/security-events', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;
  let userA: TestUser;

  beforeAll(async () => {
    await setup();
    userA = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditseceventadminA', email: 'auditseceventA@example.com' });

    const clientA = await dataManager.createClient({
        clientId: 'audit-secevent-client-A', clientName: 'Audit SecEvent Client A', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'auditseceventsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const secEventPerm = await dataManager.findOrCreatePermission({ name: 'auditlogs:read:securityevents', displayName: 'Read Audit Security Events', resource: 'auditlogs', action: 'read:securityevents' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'random:perm', displayName: 'Random Perm', resource: 'random', action: 'perm'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'audit_secevent_reader_role', permissions: [secEventPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'audit_no_secevent_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(userA.id!, adminRoleWithPerm.id);
    const userNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'auditseceventadmin_noperm', email: 'auditseceventnoperm@example.com' });
    await dataManager.assignRoleToUser(userNoPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(userA.id!, clientA.clientId, 'openid auditlogs:read:securityevents', [secEventPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(userNoPerm.id!, clientA.clientId, 'openid random:perm', [otherPerm.name]);

    // Create sample audit logs, including security and non-security events
    await prisma.auditLog.createMany({
      data: [
        { userId: userA.id, action: 'USER_LOGIN_FAILED', success: false, actorType: 'USER', actorId: userA.id!, timestamp: subDays(new Date(), 1)},
        { userId: userA.id, action: 'USER_PROFILE_UPDATED', success: true, actorType: 'USER', actorId: userA.id!, timestamp: new Date()}, // Not a security event by default list
        { action: 'SYSTEM_BACKUP_COMPLETED', success: true, actorType: 'SYSTEM', actorId: 'cron', timestamp: subDays(new Date(), 2) }, // Not a security event
        { userId: userA.id, action: 'USER_PASSWORD_CHANGED', success: true, actorType: 'USER', actorId: userA.id!, timestamp: subDays(new Date(), 0.5)},
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{userId: userA.id}, {action: 'SYSTEM_BACKUP_COMPLETED'}]} });
    await cleanup();
  });

  it('should list all predefined security events if no eventType is specified (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/security-events', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(Array.isArray(result.data)).toBe(true);
    // Expecting USER_LOGIN_FAILED and USER_PASSWORD_CHANGED from seeded data
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    result.data.forEach((log: AuditLog) => {
      expect(SECURITY_EVENT_ACTIONS).toContain(log.action);
    });
    expect(result.pagination).toBeDefined();
  });

  it('should filter by a specific eventType (e.g., USER_LOGIN_FAILED)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/security-events?eventType=USER_LOGIN_FAILED', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((log: AuditLog) => {
      expect(log.action).toBe('USER_LOGIN_FAILED');
    });
  });

  it('should return empty list if a valid security eventType has no logs', async () => {
    // Assuming USER_ACCOUNT_LOCKED is a valid security event but has no entries yet
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/security-events?eventType=USER_ACCOUNT_LOCKED', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBe(0);
  });

  it('should return 400 if eventType is provided but not in the predefined list of security events', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/security-events?eventType=NON_SECURITY_ACTION', adminTokenWithPerm);
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Unsupported security eventType');
  });

  it('should respect date filters', async () => {
    const dateFrom = formatISO(startOfDay(subDays(new Date(), 1.5))); // From 1.5 days ago (catches USER_LOGIN_FAILED)
    const dateTo = formatISO(endOfDay(subDays(new Date(), 0.75)));   // Until 0.75 days ago (catches USER_LOGIN_FAILED, not USER_PASSWORD_CHANGED)
    const url = `/api/v2/audit-logs/security-events?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const response = await httpClient.authenticatedRequest(url, adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBe(1);
    expect(result.data[0].action).toBe('USER_LOGIN_FAILED');
  });

  it('should return 403 for user without auditlogs:read:securityevents permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/audit-logs/security-events', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/audit-logs/security-events');
    expect(response.status).toBe(401);
  });
});
