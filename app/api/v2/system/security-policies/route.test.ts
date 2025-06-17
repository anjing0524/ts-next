// app/api/v2/system/security-policies/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, SecurityPolicy, PolicyType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-secpolicies-list-api');

describe('GET /api/v2/system/security-policies', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;

  beforeAll(async () => {
    await setup();
    const adminUserWithPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'secpolicyadmin', email: 'secpolicyadmin@example.com' });
    const adminUserWithoutPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'secpolicynoperm', email: 'secpolicynoperm@example.com' });

    const client = await dataManager.createClient({
        clientId: 'secpolicy-test-client', clientName: 'SecPolicy Test Client', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'secpolicysecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const listPerm = await dataManager.findOrCreatePermission({ name: 'system:securitypolicies:read', displayName: 'Read System Security Policies', resource: 'system:securitypolicies', action: 'read' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'system:health:read', displayName: 'Read System Health', resource: 'system:health', action: 'read'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'sec_policy_reader_role', permissions: [listPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'sec_policy_no_access_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(adminUserWithPerm.id!, adminRoleWithPerm.id);
    await dataManager.assignRoleToUser(adminUserWithoutPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(adminUserWithPerm.id!, client.clientId, 'openid system:securitypolicies:read', [listPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(adminUserWithoutPerm.id!, client.clientId, 'openid system:health:read', [otherPerm.name]);

    // Seed some initial security policies
    await prisma.securityPolicy.createMany({
      data: [
        { name: 'Default Password Strength', type: PolicyType.PASSWORD_STRENGTH, policy: { minLength: 8, requireUppercase: true }, isActive: true },
        { name: 'Default Login Security', type: PolicyType.LOGIN_SECURITY, policy: { maxFailedAttempts: 5 }, isActive: true },
        { name: 'Inactive Password History', type: PolicyType.PASSWORD_HISTORY, policy: { historyCount: 3 }, isActive: false },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.securityPolicy.deleteMany({where: {name: {startsWith: 'Default '}}});
    await cleanup();
  });

  it('should list all security policies for admin with permission (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(3);
    expect(result.pagination.totalItems).toBeGreaterThanOrEqual(3);

    const pwStrength = result.data.find((p: SecurityPolicy) => p.name === 'Default Password Strength');
    expect(pwStrength).toBeDefined();
    expect(pwStrength.type).toBe(PolicyType.PASSWORD_STRENGTH);
    expect(pwStrength.policy).toEqual({ minLength: 8, requireUppercase: true });
  });

  it('should filter policies by type', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies?type=LOGIN_SECURITY', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('Default Login Security');
  });

  it('should filter policies by isActive status', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies?isActive=false', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('Inactive Password History');
  });

  it('should respect pagination parameters', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies?page=1&limit=1', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.length).toBe(1);
    expect(result.pagination.pageSize).toBe(1);
    expect(result.pagination.totalPages).toBeGreaterThanOrEqual(3);
  });

  it('should return 403 for user without system:securitypolicies:read permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/security-policies', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/system/security-policies');
    expect(response.status).toBe(401);
  });
});
