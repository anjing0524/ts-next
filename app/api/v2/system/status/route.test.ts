// app/api/v2/system/status/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-status-api');

describe('GET /api/v2/system/status', () => {
  let adminTokenWithPerm: string;
  let adminTokenWithoutPerm: string;

  beforeAll(async () => {
    await setup();
    const adminUserWithPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'statusadmin', email: 'statusadmin@example.com' });
    const adminUserWithoutPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'statusnopermadmin', email: 'statusnoperm@example.com' });

    const client = await dataManager.createClient({
        clientId: 'status-test-client', clientName: 'Status Test Client', clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'statussecret', redirectUris: ['http://localhost/cb'],
        allowedScopes: ['openid'], grantTypes: ['client_credentials']
    });

    const statusPerm = await dataManager.findOrCreatePermission({ name: 'system:status:read', displayName: 'Read System Status', resource: 'system:status', action: 'read' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'system:metrics:read', displayName: 'Read System Metrics', resource: 'system:metrics', action: 'read'});

    const adminRoleWithPerm = await dataManager.createRole({ name: 'status_reader_role', permissions: [statusPerm.name] });
    const adminRoleWithoutPerm = await dataManager.createRole({ name: 'status_no_access_role', permissions: [otherPerm.name] });

    await dataManager.assignRoleToUser(adminUserWithPerm.id!, adminRoleWithPerm.id);
    await dataManager.assignRoleToUser(adminUserWithoutPerm.id!, adminRoleWithoutPerm.id);

    adminTokenWithPerm = await dataManager.createAccessToken(adminUserWithPerm.id!, client.clientId, 'openid system:status:read', [statusPerm.name]);
    adminTokenWithoutPerm = await dataManager.createAccessToken(adminUserWithoutPerm.id!, client.clientId, 'openid system:metrics:read', [otherPerm.name]);

    // Mock process.env.APP_VERSION for consistent test results
    vi.stubEnv('APP_VERSION', '1.2.3-test');
  });

  afterAll(async () => {
    vi.unstubAllEnvs(); // Restore original environment variables
    await cleanup();
  });

  it('should retrieve system status successfully with system:status:read permission (200)', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/status', adminTokenWithPerm);
    expect(response.status).toBe(200);
    const status = await response.json();

    expect(status.timestamp).toBeTypeOf('string');
    expect(status.status).toBe('OPERATIONAL'); // Based on current mock
    expect(status.version).toBe('1.2.3-test'); // From mocked env
    expect(status.uptime).toBeTypeOf('number');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(status.maintenanceMode).toBe(false); // Based on current mock
    expect(status.message).toBeTypeOf('string');
  });

  it('should return 403 for user without system:status:read permission', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/system/status', adminTokenWithoutPerm);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest('/api/v2/system/status');
    expect(response.status).toBe(401);
  });
});
