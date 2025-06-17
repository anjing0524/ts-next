// app/api/v2/system/configurations/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, SystemConfiguration } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-config-list-update-api');

describe('GET and PUT /api/v2/system/configurations', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminNoPermToken: string;

  beforeAll(async () => {
    await setup();
    const adminUserRead = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgreadadmin', email: 'syscfgread@example.com' });
    const adminUserUpdate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgupdateadmin', email: 'syscfgupdate@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgnopermadmin', email: 'syscfgnoperm@example.com' });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'system:configurations:read', displayName: 'Read System Configs', resource: 'system:configurations', action: 'read' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'system:configurations:update', displayName: 'Update System Configs', resource: 'system:configurations', action: 'update' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'system:other:read', displayName: 'Read Other System Info', resource: 'system:other', action: 'read'});


    const adminRoleRead = await dataManager.createRole({ name: 'sys_cfg_reader_role', permissions: [readPerm.name] });
    const adminRoleUpdate = await dataManager.createRole({ name: 'sys_cfg_updater_role', permissions: [updatePerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'sys_cfg_no_perm_role', permissions: [otherPerm.name]});

    await dataManager.assignRoleToUser(adminUserRead.id!, adminRoleRead.id);
    await dataManager.assignRoleToUser(adminUserUpdate.id!, adminRoleUpdate.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-sys-configs', name: 'Token Client SysConfigs', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminReadToken = await dataManager.createAccessToken(adminUserRead.id!, tokenClient.clientId, 'openid system:configurations:read', [readPerm.name]);
    adminUpdateToken = await dataManager.createAccessToken(adminUserUpdate.id!, tokenClient.clientId, 'openid system:configurations:update', [updatePerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid system:other:read', [otherPerm.name]);

    // Seed some initial system configurations
    await prisma.systemConfiguration.createMany({
      data: [
        { key: 'SITE_NAME', value: 'My Test App', description: 'Public name of the site', type: 'string', isEditable: true },
        { key: 'MAINTENANCE_MODE', value: 'false', description: 'Site maintenance mode', type: 'boolean', isEditable: true },
        { key: 'MAX_USERS', value: '1000', description: 'Maximum allowed users', type: 'number', isEditable: false },
        { key: 'FEATURE_FLAGS', value: '{"newDashboard": true, "betaFeature": false}', description: 'Feature flags JSON', type: 'json', isEditable: true },
        { key: 'API_VERSION_READONLY', value: 'v1.0', description: 'Readonly API version', type: 'string', isEditable: false },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.systemConfiguration.deleteMany({where: {key: {in: ['SITE_NAME', 'MAINTENANCE_MODE', 'MAX_USERS', 'FEATURE_FLAGS', 'API_VERSION_READONLY']}}});
    await cleanup();
  });

  describe('GET /api/v2/system/configurations', () => {
    it('should list all configurations for admin with permission (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(5);
      expect(result.pagination.totalItems).toBeGreaterThanOrEqual(5);

      const siteName = result.data.find((c: SystemConfiguration & { value: any}) => c.key === 'SITE_NAME');
      expect(siteName.value).toBe('My Test App');
      const maintenance = result.data.find((c: SystemConfiguration & { value: any}) => c.key === 'MAINTENANCE_MODE');
      expect(maintenance.value).toBe(false); // Parsed to boolean
      const featureFlags = result.data.find((c: SystemConfiguration & { value: any}) => c.key === 'FEATURE_FLAGS');
      expect(featureFlags.value).toEqual({ newDashboard: true, betaFeature: false }); // Parsed to object
    });

    it('should filter by editableOnly=true', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations?editableOnly=true', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.every((c: SystemConfiguration) => c.isEditable === true)).toBe(true);
      expect(result.data.some((c: SystemConfiguration) => c.key === 'SITE_NAME')).toBe(true);
      expect(result.data.some((c: SystemConfiguration) => c.key === 'API_VERSION_READONLY')).toBe(false);
    });

    it('should respect pagination', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations?page=1&limit=2', adminReadToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.length).toBe(2);
      expect(result.pagination.pageSize).toBe(2);
    });

    it('should return 403 for user without system:configurations:read permission', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminNoPermToken);
      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v2/system/configurations', () => {
    it('should bulk update editable configurations successfully (200 or 207)', async () => {
      const updates = [
        { key: 'SITE_NAME', value: 'My Awesome Updated App' },
        { key: 'MAINTENANCE_MODE', value: true },
        { key: 'FEATURE_FLAGS', value: { newDashboard: true, betaFeature: true, experimental: 'on' } }
      ];
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(response.status).toBe(200); // Expect 200 if all are successful
      const result = await response.json();
      expect(result.data.length).toBe(3);
      expect(result.data.find((c: any) => c.key === 'SITE_NAME').value).toBe('My Awesome Updated App');
      expect(result.data.find((c: any) => c.key === 'MAINTENANCE_MODE').value).toBe(true);
      expect(result.data.find((c: any) => c.key === 'FEATURE_FLAGS').value).toEqual({ newDashboard: true, betaFeature: true, experimental: 'on' });
    });

    it('should fail to update non-editable configurations (or return partial success 207)', async () => {
      const updates = [
        { key: 'SITE_NAME', value: 'Partial Success App' }, // Editable
        { key: 'API_VERSION_READONLY', value: 'v2.0-attempt' } // Not editable
      ];
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(response.status).toBe(207); // Multi-Status due to partial failure
      const result = await response.json();
      expect(result.updatedItems.length).toBe(1);
      expect(result.updatedItems[0].key).toBe('SITE_NAME');
      expect(result.failedItems.length).toBe(1);
      expect(result.failedItems[0].key).toBe('API_VERSION_READONLY');
      expect(result.failedItems[0].message).toContain('not editable');
    });

    it('should fail if value type does not match stored type for a config', async () => {
        const updates = [ { key: 'MAINTENANCE_MODE', value: 'not-a-boolean' } ]; // Stored as boolean
        const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminUpdateToken, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
        expect(response.status).toBe(207); // Or 400 if all fail
        const result = await response.json();
        expect(result.failedItems.length).toBe(1);
        expect(result.failedItems[0].key).toBe('MAINTENANCE_MODE');
        expect(result.failedItems[0].message).toContain('Invalid type');
    });

    it('should return 403 for user without system:configurations:update permission', async () => {
      const updates = [{ key: 'SITE_NAME', value: 'No Perm Update' }];
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations', adminNoPermToken, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      expect(response.status).toBe(403);
    });
  });
});
