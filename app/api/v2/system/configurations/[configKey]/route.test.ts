// app/api/v2/system/configurations/[configKey]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, SystemConfiguration } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('system-config-detail-api');

describe('GET and PUT /api/v2/system/configurations/{configKey}', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminNoPermToken: string;

  const editableConfigKey = 'TEST_EDITABLE_CONFIG';
  const nonEditableConfigKey = 'TEST_NON_EDITABLE_CONFIG';
  const jsonConfigKey = 'TEST_JSON_CONFIG';

  beforeAll(async () => {
    await setup();
    const adminUserRead = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgdetailread', email: 'syscfgdetailread@example.com' });
    const adminUserUpdate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgdetailupdate', email: 'syscfgdetailupdate@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'syscfgnopermdetail', email: 'syscfgnopermdetail@example.com' });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'system:configurations:read', displayName: 'Read System Configs D', resource: 'system:configurations', action: 'read' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'system:configurations:update', displayName: 'Update System Configs D', resource: 'system:configurations', action: 'update' });

    const adminRoleRead = await dataManager.createRole({ name: 'sys_cfg_detail_reader_role', permissions: [readPerm.name] });
    const adminRoleUpdate = await dataManager.createRole({ name: 'sys_cfg_detail_updater_role', permissions: [updatePerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'sys_cfg_detail_no_perm_role', permissions: []});

    await dataManager.assignRoleToUser(adminUserRead.id!, adminRoleRead.id);
    await dataManager.assignRoleToUser(adminUserUpdate.id!, adminRoleUpdate.id); // Updater also needs read for some tests if GET is used first
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-sys-config-detail', name: 'Token Client SysConfig Detail', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminReadToken = await dataManager.createAccessToken(adminUserRead.id!, tokenClient.clientId, 'openid system:configurations:read', [readPerm.name]);
    adminUpdateToken = await dataManager.createAccessToken(adminUserUpdate.id!, tokenClient.clientId, 'openid system:configurations:update', [updatePerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid', []);

    // Seed initial system configurations for detail testing
    await prisma.systemConfiguration.createMany({
      data: [
        { key: editableConfigKey, value: 'Initial Value', description: 'An editable config', type: 'string', isEditable: true },
        { key: nonEditableConfigKey, value: 'Fixed Value', description: 'A non-editable config', type: 'string', isEditable: false },
        { key: jsonConfigKey, value: '{"theme": "dark", "notifications": true}', description: 'A JSON config', type: 'json', isEditable: true },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.systemConfiguration.deleteMany({where: {key: {in: [editableConfigKey, nonEditableConfigKey, jsonConfigKey]}}});
    await cleanup();
  });

  describe('GET /api/v2/system/configurations/{configKey}', () => {
    it('should retrieve an existing configuration successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${editableConfigKey}`, adminReadToken);
      expect(response.status).toBe(200);
      const config = await response.json();
      expect(config.key).toBe(editableConfigKey);
      expect(config.value).toBe('Initial Value');
    });

    it('should parse JSON type configuration value correctly', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${jsonConfigKey}`, adminReadToken);
      expect(response.status).toBe(200);
      const config = await response.json();
      expect(config.key).toBe(jsonConfigKey);
      expect(config.value).toEqual({ theme: "dark", notifications: true });
    });

    it('should return 404 for a non-existent configKey', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations/NON_EXISTENT_KEY', adminReadToken);
      expect(response.status).toBe(404);
    });

    it('should return 403 for user without system:configurations:read permission', async () => {
       const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${editableConfigKey}`, adminNoPermToken);
       expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v2/system/configurations/{configKey}', () => {
    it('should update an editable configuration successfully (200)', async () => {
      const updatePayload = { value: 'Updated Value Successfully' };
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${editableConfigKey}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedConfig = await response.json();
      expect(updatedConfig.key).toBe(editableConfigKey);
      expect(updatedConfig.value).toBe(updatePayload.value);

      const dbConfig = await prisma.systemConfiguration.findUnique({ where: { key: editableConfigKey }});
      expect(dbConfig?.value).toBe(updatePayload.value);
    });

    it('should update an editable JSON configuration successfully (200)', async () => {
      const updatePayload = { value: { theme: "light", notifications: false, newFlag: "test" } };
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${jsonConfigKey}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(200);
      const updatedConfig = await response.json();
      expect(updatedConfig.key).toBe(jsonConfigKey);
      expect(updatedConfig.value).toEqual(updatePayload.value);

      const dbConfig = await prisma.systemConfiguration.findUnique({ where: { key: jsonConfigKey }});
      expect(JSON.parse(dbConfig!.value)).toEqual(updatePayload.value);
    });

    it('should return 403 when trying to update a non-editable configuration', async () => {
      const updatePayload = { value: 'Attempt to Update NonEditable' };
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${nonEditableConfigKey}`, adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.message).toContain('not editable');
    });

    it('should return 400 if value type does not match stored type', async () => {
        // editableConfigKey is 'string', try to update with a number
        const updatePayload = { value: 12345 };
        const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${editableConfigKey}`, adminUpdateToken, {
            method: 'PUT',
            body: JSON.stringify(updatePayload)
        });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.message).toContain('Invalid type for string config');
    });

    it('should return 404 for updating a non-existent configKey', async () => {
      const updatePayload = { value: 'No Such Config' };
      const response = await httpClient.authenticatedRequest('/api/v2/system/configurations/NON_EXISTENT_KEY_UPDATE', adminUpdateToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(404);
    });

    it('should return 403 for user without system:configurations:update permission', async () => {
      const updatePayload = { value: 'No Perm Update Value' };
      const response = await httpClient.authenticatedRequest(`/api/v2/system/configurations/${editableConfigKey}`, adminNoPermToken, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      expect(response.status).toBe(403);
    });
  });
});
