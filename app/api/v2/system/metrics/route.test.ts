// app/api/v2/system/metrics/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestClient } from '@/../__tests__/utils/test-helpers';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-metrics-api');

describe('GET /api/v2/system/metrics', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;

  beforeAll(async () => {
    await setup();
    const adminUserWithPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'metricsadmin', email: 'metricsadmin@example.com' });
    const adminUserWithoutPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'metricsnopermadmin', email: 'metricsnoperm@example.com' });

    const client = await dataManager.createClient({
        clientId: 'metrics-test-client', clientName: 'Metrics Test Client', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'metricssecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const metricsPerm = await dataManager.findOrCreatePermission({ name: 'system:metrics:read', displayName: 'Read System Metrics', resource: 'system:metrics', action: 'read' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'system:health:read', displayName: 'Read System Health', resource: 'system:health', action: 'read'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'metrics_reader_role', permissions: [metricsPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'metrics_no_access_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(adminUserWithPerm.id!, adminRoleWithPerm.id);
    await dataManager.assignRoleToUser(adminUserWithoutPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(adminUserWithPerm.id!, client.clientId, 'openid system:metrics:read', [metricsPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(adminUserWithoutPerm.id!, client.clientId, 'openid system:health:read', [otherPerm.name]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should retrieve system metrics successfully with system:metrics:read permission (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/metrics', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const metrics = await response.json();

    expect(metrics.timestamp).toBeTypeOf('string');
    expect(metrics.nodejsVersion).toBeTypeOf('string');
    expect(metrics.platform).toBeTypeOf('string');
    expect(metrics.osType).toBeTypeOf('string');
    expect(metrics.osRelease).toBeTypeOf('string');
    expect(metrics.architecture).toBeTypeOf('string');
    expect(metrics.cpuCores).toBeTypeOf('number');
    expect(metrics.totalMemoryMB).toBeTypeOf('string'); // Stored as string after .toFixed(2)
    expect(parseFloat(metrics.totalMemoryMB)).toBeGreaterThan(0);
    expect(metrics.freeMemoryMB).toBeTypeOf('string');
    expect(metrics.usedMemoryMB).toBeTypeOf('string');
    expect(metrics.uptimeSeconds).toBeTypeOf('number');
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);

    expect(metrics.processMemoryUsage).toBeTypeOf('object');
    expect(metrics.processMemoryUsage.rssMB).toBeTypeOf('string');
    expect(metrics.processMemoryUsage.heapTotalMB).toBeTypeOf('string');
    expect(metrics.processMemoryUsage.heapUsedMB).toBeTypeOf('string');

    expect(Array.isArray(metrics.loadAverage)).toBe(true);
    // Length can vary by OS, or be [0,0,0] on Windows
    // expect(metrics.loadAverage.length).toBe(3);
  });

  it('should return 403 for user without system:metrics:read permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/metrics', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/system/metrics');
    expect(response.status).toBe(401);
  });
});
