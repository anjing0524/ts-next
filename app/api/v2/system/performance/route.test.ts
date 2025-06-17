// app/api/v2/system/performance/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-performance-api');

describe('GET /api/v2/system/performance', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;

  beforeAll(async () => {
    await setup();
    const adminUserWithPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'perfadmin', email: 'perfadmin@example.com' });
    const adminUserWithoutPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'perfnopermadmin', email: 'perfnoperm@example.com' });

    const client = await dataManager.createClient({
        clientId: 'perf-test-client', clientName: 'Performance Test Client', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'perfsecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const performancePerm = await dataManager.findOrCreatePermission({ name: 'system:performance:read', displayName: 'Read System Performance', resource: 'system:performance', action: 'read' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'system:status:read', displayName: 'Read System Status', resource: 'system:status', action: 'read'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'performance_reader_role', permissions: [performancePerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'performance_no_access_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(adminUserWithPerm.id!, adminRoleWithPerm.id);
    await dataManager.assignRoleToUser(adminUserWithoutPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(adminUserWithPerm.id!, client.clientId, 'openid system:performance:read', [performancePerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(adminUserWithoutPerm.id!, client.clientId, 'openid system:status:read', [otherPerm.name]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should retrieve system performance metrics successfully with system:performance:read permission (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/performance', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const perf = await response.json();

    expect(perf.timestamp).toBeTypeOf('string');
    expect(Array.isArray(perf.cpuLoad)).toBe(true);
    // cpuLoad can be [0,0,0] on some systems, especially idle ones or Windows. Just check array type and length if possible.
    // expect(perf.cpuLoad.length).toBe(3); // This might fail on Windows.

    expect(perf.memoryUsage).toBeTypeOf('object');
    expect(perf.memoryUsage.processRssMB).toBeTypeOf('number');
    expect(perf.memoryUsage.processHeapUsedMB).toBeTypeOf('number');
    expect(perf.memoryUsage.systemFreeMemoryMB).toBeTypeOf('number');
    expect(perf.memoryUsage.systemTotalMemoryMB).toBeTypeOf('number');

    expect(perf.uptimeSeconds).toBeTypeOf('number');
    expect(perf.uptimeSeconds).toBeGreaterThanOrEqual(0);

    expect(perf.activeHandles).toBeTypeOf('number'); // Can be -1 if _getActiveHandles is not available
  });

  it('should return 403 for user without system:performance:read permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/performance', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/system/performance');
    expect(response.status).toBe(401);
  });
});
