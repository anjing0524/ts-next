// app/api/v2/clients/[clientIdString]/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestClient, TestDataManager, TEST_USERS } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType } from '@prisma/client';

const { httpClient, dataManager, setup, cleanup: globalCleanup } = createOAuth2TestSetup('client-detail-api');

describe('GET /api/v2/clients/{clientIdString}', () => {
  let adminReadToken: string;
  let testClientConfidential: TestClient;
  let testClientPublic: TestClient;

  beforeAll(async () => {
    await setup();
    const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'clientreadadmin' });
    const readPerm = await dataManager.findOrCreatePermission({ name: 'clients:read', resource: 'clients', action: 'read' });
    const adminRole = await dataManager.createRole({ name: 'test_admin_role_for_client_read', permissions: [readPerm.name] });
    await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-client-read', name: 'Token Client Detail', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
    adminReadToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, 'openid clients:read', [readPerm.name]);

    // Create clients for testing retrieval
    testClientConfidential = await dataManager.createClient({
      clientId: 'test-client-confidential-detail',
      clientName: 'Confidential Client Detail',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'SecretForDetail123!',
      redirectUris: ['https://conf-detail.com/cb'],
      allowedScopes: ['openid', 'profile'],
      grantTypes: ['authorization_code', 'refresh_token']
    });
    testClientPublic = await dataManager.createClient({
      clientId: 'test-client-public-detail',
      clientName: 'Public Client Detail',
      clientType: ClientType.PUBLIC,
      redirectUris: ['https://pub-detail.com/cb'],
      allowedScopes: ['openid'],
      grantTypes: ['authorization_code']
    });
  });

  afterAll(async () => {
    await globalCleanup();
  });

  it('should retrieve an existing confidential client successfully (200)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${testClientConfidential.clientId}`, adminReadToken);
    expect(response.status).toBe(200);
    const client = await response.json();

    expect(client.id).toBe(testClientConfidential.id); // Prisma CUID
    expect(client.clientId).toBe(testClientConfidential.clientId);
    expect(client.clientName).toBe(testClientConfidential.clientName);
    expect(client.clientType).toBe(ClientType.CONFIDENTIAL);
    expect(client.redirectUris).toEqual(testClientConfidential.redirectUris);
    expect(client.allowedScopes).toEqual(testClientConfidential.allowedScopes);
    expect(client.clientSecret).toBeUndefined(); // IMPORTANT: Secret (even hash) should not be returned
  });

  it('should retrieve an existing public client successfully (200)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${testClientPublic.clientId}`, adminReadToken);
    expect(response.status).toBe(200);
    const client = await response.json();

    expect(client.clientId).toBe(testClientPublic.clientId);
    expect(client.clientName).toBe(testClientPublic.clientName);
    expect(client.clientType).toBe(ClientType.PUBLIC);
    expect(client.clientSecret).toBeUndefined();
  });

  it('should return 404 for a non-existent client ID', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/clients/nonexistentclientid', adminReadToken);
    expect(response.status).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Not Found');
    expect(error.message).toBe('Client not found');
  });

  it('should return 403 for unauthorized access (insufficient permissions)', async () => {
    const regularUser = await dataManager.createTestUser('REGULAR');
    const viewerRole = await dataManager.createTestRole('VIEWER'); // Assuming VIEWER doesn't have clients:read
    await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-no-perm-client-read', name: 'Token Client No Perm', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
    const noReadToken = await dataManager.createAccessToken(regularUser.id!, tokenClient.clientId, 'openid', []);

    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${testClientPublic.clientId}`, noReadToken);
    expect(response.status).toBe(403);
  });

  it('should return 401 if no token is provided', async () => {
    const response = await httpClient.makeRequest(`/api/v2/clients/${testClientPublic.clientId}`);
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/v2/clients/{clientIdString}', () => {
  let adminUpdateToken: string;
  let clientToUpdate: TestClient;

  beforeAll(async () => {
    const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'clientupdateadmin' });
    const updatePerm = await dataManager.findOrCreatePermission({ name: 'clients:update', resource: 'clients', action: 'update' });
    const adminRole = await dataManager.createRole({ name: 'test_admin_role_for_client_update', permissions: [updatePerm.name] });
    await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);
    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-client-update', name: 'Token Client Update', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
    adminUpdateToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, 'openid clients:update', [updatePerm.name]);
  });

  beforeEach(async () => {
    // Create a client to be updated in each test
    clientToUpdate = await dataManager.createClient({
      clientId: 'client-to-update',
      clientName: 'Original Client Name',
      clientType: ClientType.CONFIDENTIAL,
      clientSecret: 'OriginalSecret123!',
      redirectUris: ['https://original.com/cb'],
      allowedScopes: ['openid', 'profile'],
      grantTypes: ['authorization_code'],
      accessTokenLifetime: 3600,
    });
  });

  afterEach(async () => {
    // Clean up the client after each test
    try {
      const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientToUpdate.clientId } });
      if (client) {
        await prisma.oAuthClient.delete({ where: { clientId: clientToUpdate.clientId } });
      }
    } catch (e) { /* ignore */ }
    try { // cleanup just in case name changed or other issues
        const clientByName = await prisma.oAuthClient.findFirst({where: {clientName: 'Updated Client Name'}});
        if(clientByName) await prisma.oAuthClient.delete({where: {id: clientByName.id}});
    } catch(e) {/* ignore */}
  });

  it('should successfully update client details (clientName, redirectUris, isActive)', async () => {
    const patchData = {
      clientName: 'Updated Client Name',
      redirectUris: ['https://updated.com/cb', 'https://another.updated.com/cb'],
      isActive: false,
      allowedScopes: ['openid', 'email'],
      accessTokenLifetime: 7200,
    };

    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToUpdate.clientId}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });

    expect(response.status).toBe(200);
    const updatedClient = await response.json();

    expect(updatedClient.clientName).toBe(patchData.clientName);
    expect(updatedClient.redirectUris).toEqual(patchData.redirectUris);
    expect(updatedClient.isActive).toBe(patchData.isActive);
    expect(updatedClient.allowedScopes).toEqual(patchData.allowedScopes);
    expect(updatedClient.accessTokenLifetime).toBe(patchData.accessTokenLifetime);
    expect(updatedClient.clientSecret).toBeUndefined(); // Secret should not be returned unless changed

    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientToUpdate.clientId } });
    expect(dbClient?.clientName).toBe(patchData.clientName);
    expect(JSON.parse(dbClient!.redirectUris)).toEqual(patchData.redirectUris);
    expect(dbClient?.isActive).toBe(patchData.isActive);
  });

  it('should successfully update clientSecret for a confidential client and return the new secret', async () => {
    const patchData = {
      clientSecret: 'NewStrongSecret456!',
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToUpdate.clientId}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(200);
    const updatedClient = await response.json();
    expect(updatedClient.clientSecret).toBe(patchData.clientSecret); // New plain secret returned this one time

    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientToUpdate.clientId } });
    const { AuthUtils } = await import('@/lib/auth/passwordUtils');
    const isSecretCorrect = await AuthUtils.comparePassword(patchData.clientSecret, dbClient!.clientSecret!);
    expect(isSecretCorrect).toBe(true);
  });

  it('should disallow changing clientId (400 or ignored)', async () => {
    const patchData = {
      clientId: 'new-client-id-attempt',
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToUpdate.clientId}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    // Expecting the API to either reject this (400) or ignore the clientId field (200 but clientId unchanged)
    // Based on typical design, it should be rejected or ignored. If ignored, the client ID in response is the old one.
    expect(response.status).toBe(400); // Assuming it's rejected as per common practice for immutable identifiers.
    const body = await response.json();
    expect(body.message).toContain("Client ID modification is not allowed");
  });

  it('should disallow changing clientType (400 or ignored)', async () => {
    const patchData = {
      clientType: ClientType.PUBLIC, // Attempting to change from CONFIDENTIAL
    };
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToUpdate.clientId}`, adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(400); // Assuming type change is restricted.
    const body = await response.json();
    expect(body.message).toContain("Client type modification is not allowed");
  });

  it('should return 404 when trying to update a non-existent client', async () => {
    const patchData = { clientName: "No Such Client Update" };
    const response = await httpClient.authenticatedRequest('/api/v2/clients/nonexistentclientid', adminUpdateToken, {
      method: 'PATCH',
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(404);
  });
});


describe('DELETE /api/v2/clients/{clientIdString}', () => {
  let adminDeleteToken: string;
  let clientToDelete: TestClient;

  beforeAll(async () => {
    const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'clientdeleteadmin' });
    const deletePerm = await dataManager.findOrCreatePermission({ name: 'clients:delete', resource: 'clients', action: 'delete' });
    const adminRole = await dataManager.createRole({ name: 'test_admin_role_for_client_delete', permissions: [deletePerm.name] });
    await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);
    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-client-delete', name: 'Token Client Delete', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
    adminDeleteToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, 'openid clients:delete', [deletePerm.name]);
  });

  beforeEach(async () => {
    // Create a client to be deleted in each test
    clientToDelete = await dataManager.createClient({
      clientId: 'client-to-delete',
      clientName: 'Client To Delete',
      clientType: ClientType.PUBLIC,
      redirectUris: ['https://delete.me/cb'],
    });
  });

  afterEach(async () => {
    // Ensure cleanup if test failed before deletion
     try {
      const client = await prisma.oAuthClient.findUnique({ where: { clientId: clientToDelete.clientId } });
      if (client) {
        await prisma.oAuthClient.delete({ where: { clientId: clientToDelete.clientId } });
      }
    } catch (e) { /* ignore */ }
  });

  it('should successfully delete an existing client (204)', async () => {
    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToDelete.clientId}`, adminDeleteToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);

    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientToDelete.clientId } });
    expect(dbClient).toBeNull();
  });

  it('should return 404 when trying to delete a non-existent client', async () => {
    const response = await httpClient.authenticatedRequest('/api/v2/clients/nonexistentclientidfordelete', adminDeleteToken, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);
  });

  it('should return 403 for unauthorized deletion (insufficient permissions)', async () => {
    const regularUser = await dataManager.createTestUser('REGULAR');
    const viewerRole = await dataManager.createTestRole('VIEWER'); // Does not have clients:delete
    await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
    const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-no-perm-client-delete', name: 'Token Client No Delete Perm', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes:['openid'] });
    const noDeleteToken = await dataManager.createAccessToken(regularUser.id!, tokenClient.clientId, 'openid', []);

    const response = await httpClient.authenticatedRequest(`/api/v2/clients/${clientToDelete.clientId}`, noDeleteToken, {
        method: 'DELETE',
    });
    expect(response.status).toBe(403);
  });
});
