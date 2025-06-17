// app/api/v2/scopes/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, Scope } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('scopes-list-create-api');

describe('POST and GET /api/v2/scopes', () => {
  let adminCreateToken: string;
  let adminListToken: string;
  let adminNoPermToken: string; // Token for a user without specific scope permissions

  beforeAll(async () => {
    await setup();
    const adminUserCreate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopeadmincreate', email: 'scopecreate@example.com' });
    const adminUserList = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopeadminlist', email: 'scopelist@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopeadminnoperm', email: 'scopenoperm@example.com' });

    const createPerm = await dataManager.findOrCreatePermission({ name: 'scopes:create', displayName: 'Create Scopes', resource: 'scopes', action: 'create' });
    const listPerm = await dataManager.findOrCreatePermission({ name: 'scopes:list', displayName: 'List Scopes', resource: 'scopes', action: 'list' });
    // A generic permission for the no-permission user
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'some:other', displayName: 'Some Other Permission', resource: 'other', action: 'other'});


    const adminRoleCreate = await dataManager.createRole({ name: 'scope_creator_role', permissions: [createPerm.name] });
    const adminRoleList = await dataManager.createRole({ name: 'scope_lister_role', permissions: [listPerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'scope_no_perm_role', permissions: [otherPerm.name]});


    await dataManager.assignRoleToUser(adminUserCreate.id!, adminRoleCreate.id);
    await dataManager.assignRoleToUser(adminUserList.id!, adminRoleList.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-scopes', name: 'Token Client Scopes', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminCreateToken = await dataManager.createAccessToken(adminUserCreate.id!, tokenClient.clientId, 'openid scopes:create', [createPerm.name]);
    adminListToken = await dataManager.createAccessToken(adminUserList.id!, tokenClient.clientId, 'openid scopes:list', [listPerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid some:other', [otherPerm.name]);


    // Seed some initial scopes for list testing
    await prisma.scope.createMany({
      data: [
        { name: 'scope:read', description: 'Read scope for listing', isPublic: true, isActive: true },
        { name: 'scope:write', description: 'Write scope for listing', isPublic: false, isActive: true },
        { name: 'scope:inactive', description: 'Inactive scope', isPublic: false, isActive: false },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    await prisma.scope.deleteMany({where: {name: {startsWith: 'test:'}}});
    await prisma.scope.deleteMany({where: {name: {startsWith: 'scope:'}}});
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up scopes created by specific tests to avoid name conflicts
    await prisma.scope.deleteMany({ where: { name: { startsWith: 'test:scope:' } } });
  });


  describe('POST /api/v2/scopes', () => {
    it('should create a new scope successfully (201)', async () => {
      const newScopeData = {
        name: 'test:scope:manage',
        displayName: 'Manage Test Scope', // displayName is not in current Scope model, but in Permission model
        description: 'Allows managing test scopes.',
        isPublic: true,
        isActive: true,
      };
      const response = await httpClient.authenticatedRequest('/api/v2/scopes', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newScopeData),
      });
      expect(response.status).toBe(201);
      const createdScope = await response.json();
      expect(createdScope.name).toBe(newScopeData.name);
      expect(createdScope.description).toBe(newScopeData.description);
      expect(createdScope.isPublic).toBe(newScopeData.isPublic);
      expect(createdScope.isActive).toBe(newScopeData.isActive);
    });

    it('should return 400 for missing name', async () => {
      const newScopeData = { description: 'A scope without a name' };
      const response = await httpClient.authenticatedRequest('/api/v2/scopes', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newScopeData),
      });
      expect(response.status).toBe(400);
    });

    it('should return 409 if scope name already exists', async () => {
      const existingName = 'scope:read'; // Created in beforeAll
      const newScopeData = { name: existingName, description: 'Attempt to duplicate' };
      const response = await httpClient.authenticatedRequest('/api/v2/scopes', adminCreateToken, {
        method: 'POST',
        body: JSON.stringify(newScopeData),
      });
      expect(response.status).toBe(409);
    });

    it('should return 403 for user without scopes:create permission', async () => {
      const newScopeData = { name: 'test:scope:forbidden', description: 'This should not be created' };
      const response = await httpClient.authenticatedRequest('/api/v2/scopes', adminNoPermToken, {
        method: 'POST',
        body: JSON.stringify(newScopeData),
      });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v2/scopes', () => {
    it('should list scopes successfully with pagination (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes?page=1&limit=2', adminListToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.totalItems).toBeGreaterThanOrEqual(3); // scope:read, scope:write, scope:inactive + any test:scope created
    });

    it('should filter scopes by name (contains, case-insensitive)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes?name=READ', adminListToken); // scope:read
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.every((s: Scope) => s.name.toLowerCase().includes('read'))).toBe(true);
    });

    it('should filter scopes by isActive status', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes?isActive=false', adminListToken);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.every((s: Scope) => s.isActive === false)).toBe(true);
      expect(result.data.some((s: Scope) => s.name === 'scope:inactive')).toBe(true);
    });

    it('should return 403 for user without scopes:list permission', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes', adminNoPermToken);
      expect(response.status).toBe(403);
    });
  });
});
