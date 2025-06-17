// app/api/v2/scopes/[scopeId]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestUser, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType, Scope } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('scope-detail-api');

describe('/api/v2/scopes/{scopeId}', () => {
  let adminReadToken: string;
  let adminUpdateToken: string;
  let adminDeleteToken: string;
  let adminNoPermToken: string;

  let testScope1: Scope;
  let testScope2: Scope; // For specific tests like deletion conflict

  beforeAll(async () => {
    await setup();
    const adminUserRead = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopedetailreadadmin', email: 'scopedetailread@example.com' });
    const adminUserUpdate = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopedetailupdateadmin', email: 'scopedetailupdate@example.com' });
    const adminUserDelete = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopedetaildeleteadmin', email: 'scopedetaildelete@example.com' });
    const adminUserNoPerm = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'scopedetailnopermadmin', email: 'scopedetailnoperm@example.com' });

    const readPerm = await dataManager.findOrCreatePermission({ name: 'scopes:read', displayName: 'Read Scopes D', resource: 'scopes', action: 'read' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'scopes:update', displayName: 'Update Scopes D', resource: 'scopes', action: 'update' });
    const deletePerm = await dataManager.findOrCreatePermission({ name: 'scopes:delete', displayName: 'Delete Scopes D', resource: 'scopes', action: 'delete' });
    const otherPerm = await dataManager.findOrCreatePermission({ name: 'other:detail', displayName: 'Other Detail Perm', resource: 'other', action: 'detail'});


    const adminRoleRead = await dataManager.createRole({ name: 'scope_detail_reader_role', permissions: [readPerm.name] });
    const adminRoleUpdate = await dataManager.createRole({ name: 'scope_detail_updater_role', permissions: [updatePerm.name] });
    const adminRoleDelete = await dataManager.createRole({ name: 'scope_detail_deleter_role', permissions: [deletePerm.name] });
    const adminRoleNoPerm = await dataManager.createRole({ name: 'scope_detail_no_perm_role', permissions: [otherPerm.name]});

    await dataManager.assignRoleToUser(adminUserRead.id!, adminRoleRead.id);
    await dataManager.assignRoleToUser(adminUserUpdate.id!, adminRoleUpdate.id);
    await dataManager.assignRoleToUser(adminUserDelete.id!, adminRoleDelete.id);
    await dataManager.assignRoleToUser(adminUserNoPerm.id!, adminRoleNoPerm.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-scope-details', name: 'Token Client Scope Details', clientType: 'CONFIDENTIAL', clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });

    adminReadToken = await dataManager.createAccessToken(adminUserRead.id!, tokenClient.clientId, 'openid scopes:read', [readPerm.name]);
    adminUpdateToken = await dataManager.createAccessToken(adminUserUpdate.id!, tokenClient.clientId, 'openid scopes:update', [updatePerm.name]);
    adminDeleteToken = await dataManager.createAccessToken(adminUserDelete.id!, tokenClient.clientId, 'openid scopes:delete', [deletePerm.name]);
    adminNoPermToken = await dataManager.createAccessToken(adminUserNoPerm.id!, tokenClient.clientId, 'openid other:detail', [otherPerm.name]);
  });

  beforeEach(async () => {
    // Clear and recreate test scopes
    await prisma.scope.deleteMany({where: {name: {startsWith: 'test:scopedetail:'}}});
    testScope1 = await prisma.scope.create({
      data: { name: 'test:scopedetail:read', description: 'Read access to test detail resource', isPublic: true, isActive: true }
    });
    testScope2 = await prisma.scope.create({
      data: { name: 'test:scopedetail:write', description: 'Write access to test detail resource', isPublic: false, isActive: true }
    });
  });

  afterAll(async () => {
    await prisma.scope.deleteMany({where: {name: {startsWith: 'test:scopedetail:'}}});
    await cleanup();
  });

  describe('GET /api/v2/scopes/{scopeId}', () => {
    it('should retrieve an existing scope successfully (200)', async () => {
      const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminReadToken);
      expect(response.status).toBe(200);
      const scope = await response.json();
      expect(scope.id).toBe(testScope1.id);
      expect(scope.name).toBe(testScope1.name);
    });

    it('should return 404 for a non-existent scope ID', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes/clnonexistentscope1', adminReadToken);
      expect(response.status).toBe(404);
    });

    it('should return 400 for an invalid scope ID format', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes/invalid-id-format', adminReadToken);
      expect(response.status).toBe(400);
    });

    it('should return 403 for user without scopes:read permission', async () => {
       const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminNoPermToken);
       expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v2/scopes/{scopeId}', () => {
    it('should update scope description, isPublic, and isActive successfully (200)', async () => {
      const patchData = {
        description: 'Updated description for test scope 1.',
        isPublic: false,
        isActive: false,
      };
      const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(200);
      const updatedScope = await response.json();
      expect(updatedScope.description).toBe(patchData.description);
      expect(updatedScope.isPublic).toBe(patchData.isPublic);
      expect(updatedScope.isActive).toBe(patchData.isActive);
      expect(updatedScope.name).toBe(testScope1.name); // Name should not change
    });

    it('should not allow updating scope name (400)', async () => {
      const patchData = { name: 'test:scopedetail:newname' };
      const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain("Scope name cannot be changed");
    });

    it('should return 400 if no fields are provided for update', async () => {
        const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminUpdateToken, {
            method: 'PATCH',
            body: JSON.stringify({})
        });
        expect(response.status).toBe(400);
        const error = await response.json();
        expect(error.message).toContain("No fields provided for update");
    });

    it('should return 404 for updating a non-existent scope ID', async () => {
      const patchData = { description: 'No such scope' };
      const response = await httpClient.authenticatedRequest('/api/v2/scopes/clnonexistentscope2', adminUpdateToken, {
        method: 'PATCH',
        body: JSON.stringify(patchData),
      });
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v2/scopes/{scopeId}', () => {
    it('should delete an existing scope successfully (204)', async () => {
      // testScope2 is not used by any client initially
      const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope2.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(204);
      const dbScope = await prisma.scope.findUnique({ where: { id: testScope2.id } });
      expect(dbScope).toBeNull();
    });

    it('should return 409 if scope is in use by an OAuthClient', async () => {
      // Assign testScope1 to a client
      await dataManager.createClient({
        clientId: 'client-using-scope',
        clientName: 'Client Using Scope',
        allowedScopes: [testScope1.name], // Uses the scope name
        clientType: ClientType.PUBLIC,
        redirectUris: ['http://localhost/clientcb']
      });

      const response = await httpClient.authenticatedRequest(`/api/v2/scopes/${testScope1.id}`, adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.message).toContain('is still in use by');

      // Cleanup client
      await prisma.oAuthClient.delete({where: {clientId: 'client-using-scope'}});
    });

    it('should return 404 for deleting a non-existent scope ID', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/scopes/clnonexistentscope3', adminDeleteToken, {
        method: 'DELETE',
      });
      expect(response.status).toBe(404);
    });
  });
});
