// app/api/v2/clients/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createOAuth2TestSetup, TestClient, TestDataManager, TEST_USERS, TEST_ROLES, TEST_PERMISSIONS } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { ClientType } from '@prisma/client'; // Import enum for type safety

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('client-api');

async function getClientAdminAccessToken(): Promise<string> {
  const adminUser = await dataManager.createUser({ ...TEST_USERS.ADMIN, username: 'clientadmin' });
  const createPerm = await dataManager.findOrCreatePermission({ name: 'clients:create', resource: 'clients', action: 'create' });
  const readPerm = await dataManager.findOrCreatePermission({ name: 'clients:read', resource: 'clients', action: 'read' });
  const listPerm = await dataManager.findOrCreatePermission({ name: 'clients:list', resource: 'clients', action: 'list' });

  const adminRoleData = {
    name: 'test_admin_role_for_client_management',
    permissions: [createPerm.name, readPerm.name, listPerm.name],
  };
  const adminRole = await dataManager.createRole(adminRoleData);
  await dataManager.assignRoleToUser(adminUser.id!, adminRole.id);

  // Using a different client for token generation to avoid conflicts if this admin also creates clients
  const tokenClient = await dataManager.createClient({ clientId: 'token-client-for-admin', name: 'Token Client', clientType: ClientType.CONFIDENTIAL, clientSecret: 'supersecret', redirectUris: ['http://localhost/cb'], grantTypes: ['client_credentials'], allowedScopes: ['openid'] });

  const accessToken = await dataManager.createAccessToken(adminUser.id!, tokenClient.clientId, 'openid clients:create clients:read clients:list', [createPerm.name, readPerm.name, listPerm.name]);
  return accessToken;
}

describe('OAuth Client API Endpoints (/api/v2/clients)', () => {
  let adminToken: string;

  beforeAll(async () => {
    await setup();
    adminToken = await getClientAdminAccessToken();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean up clients created with specific test prefixes to avoid interference
    const clients = await prisma.oAuthClient.findMany({
      where: {
        OR: [
          { clientId: { startsWith: 'testconfclient' } },
          { clientId: { startsWith: 'testpublicclient' } },
          { clientId: { startsWith: 'testnewclient' } },
        ],
      },
    });
    const clientIds = clients.map(c => c.id);
    if (clientIds.length > 0) {
      // Cascade deletes should handle related tokens, codes etc. if schema is set up for it.
      // Otherwise, manual cleanup of related entities might be needed.
      await prisma.oAuthClient.deleteMany({ where: { id: { in: clientIds } } });
    }
  });

  describe('POST /api/v2/clients', () => {
    it('should create a new confidential client successfully (201)', async () => {
      const newClientData: Partial<TestClient> & { clientName: string, clientType: ClientType } = {
        clientId: 'testconfclient01', // Admin can suggest a clientId
        clientName: 'Test Confidential Client',
        clientType: ClientType.CONFIDENTIAL,
        clientSecret: 'StrongSecret123!', // Admin provides a secret
        redirectUris: ['https://app.example.com/callback1', 'https://app.example.com/callback2'],
        allowedScopes: ['openid', 'profile', 'email', 'api:read'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        accessTokenLifetime: 3600,
        refreshTokenLifetime: 2592000,
      };

      const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });

      expect(response.status).toBe(201);
      const createdClient = await response.json();

      expect(createdClient.id).toBeDefined();
      expect(createdClient.clientId).toBe(newClientData.clientId);
      expect(createdClient.clientName).toBe(newClientData.clientName);
      expect(createdClient.clientType).toBe(ClientType.CONFIDENTIAL);
      expect(createdClient.redirectUris).toEqual(newClientData.redirectUris);
      expect(createdClient.allowedScopes).toEqual(newClientData.allowedScopes);
      expect(createdClient.grantTypes).toEqual(newClientData.grantTypes);
      expect(createdClient.responseTypes).toEqual(newClientData.responseTypes);
      expect(createdClient.accessTokenLifetime).toBe(newClientData.accessTokenLifetime);
      expect(createdClient.requirePkce).toBe(true); // Default
      expect(createdClient.clientSecret).toBe(newClientData.clientSecret); // Plain secret returned on creation

      // Verify in DB
      const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: newClientData.clientId } });
      expect(dbClient).toBeDefined();
      expect(dbClient?.clientName).toBe(newClientData.clientName);
      expect(dbClient?.clientSecret).toBeDefined();
      expect(dbClient?.clientSecret).not.toBe(newClientData.clientSecret); // Should be hashed
      const { AuthUtils } = await import('@/lib/auth/passwordUtils'); // Using passwordUtils for bcrypt compare for now
      const isSecretCorrect = await AuthUtils.comparePassword(newClientData.clientSecret!, dbClient!.clientSecret!);
      expect(isSecretCorrect).toBe(true);
    });

    it('should create a new public client successfully (201)', async () => {
      const newClientData: Partial<TestClient> & { clientName: string, clientType: ClientType } = {
        clientId: 'testpublicclient01',
        clientName: 'Test Public Client',
        clientType: ClientType.PUBLIC,
        redirectUris: ['https://spa.example.com/callback'],
        allowedScopes: ['openid', 'profile'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        requirePkce: true, // Explicitly set, though default
      };

      const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });

      expect(response.status).toBe(201);
      const createdClient = await response.json();
      expect(createdClient.clientId).toBe(newClientData.clientId);
      expect(createdClient.clientType).toBe(ClientType.PUBLIC);
      expect(createdClient.clientSecret).toBeUndefined(); // No secret for public client

      const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: newClientData.clientId } });
      expect(dbClient).toBeDefined();
      expect(dbClient?.clientSecret).toBeNull();
      expect(dbClient?.requirePkce).toBe(true);
    });

    it('should auto-generate clientSecret for confidential client if not provided (201)', async () => {
      const newClientData = {
        clientId: 'testconfclient02_autosecret',
        clientName: 'Confidential Client Auto Secret',
        clientType: ClientType.CONFIDENTIAL,
        redirectUris: ['https://auto.secret/callback'],
        allowedScopes: ['openid'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
      };
       const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });
      expect(response.status).toBe(201);
      const createdClient = await response.json();
      expect(createdClient.clientSecret).toBeDefined(); // Auto-generated secret should be returned
      expect(createdClient.clientSecret?.length).toBeGreaterThan(10); // Basic check for a generated secret

      const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: newClientData.clientId } });
      expect(dbClient).toBeDefined();
      expect(dbClient?.clientSecret).toBeDefined(); // Should be hashed in DB
      expect(dbClient?.clientSecret).not.toBe(createdClient.clientSecret);
    });


    it('should return 400 for missing clientName', async () => {
      const newClientData = {
        clientId: 'testmissingname',
        clientType: ClientType.PUBLIC,
        redirectUris: ['https://missing.name/callback'],
      };
      const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "clientName", message: expect.any(String) })
      ]));
    });

    it('should return 400 for invalid redirectUris (e.g., not an array or invalid URL)', async () => {
      const newClientData = {
        clientName: 'Test Invalid URI',
        clientType: ClientType.PUBLIC,
        redirectUris: 'not-an-array', // Invalid
      };
      let response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });
      expect(response.status).toBe(400);

      const newClientData2 = {
        clientName: 'Test Invalid URI 2',
        clientType: ClientType.PUBLIC,
        redirectUris: ['not-a-valid-url'], // Invalid URL
      };
      response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData2),
      });
      expect(response.status).toBe(400);
       const error = await response.json();
       expect(error.issues[0].field).toBe("redirectUris"); // or redirectUris.0 for specific item
    });

    it('should return 409 if clientId already exists', async () => {
      const existingClientId = 'existingclient001';
      await dataManager.createClient({ clientId: existingClientId, clientName: 'PreExisting', clientType: ClientType.PUBLIC, redirectUris: ['http://exist.com/cb'] });

      const newClientData = {
        clientId: existingClientId, // Attempt to use existing ID
        clientName: 'Duplicate Client ID Test',
        clientType: ClientType.PUBLIC,
        redirectUris: ['https://duplicate.com/callback'],
        allowedScopes: ['openid'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
      };
      const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });
      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.message).toContain('Client ID already exists');
    });

    it('should return 403 for unauthorized access (no clients:create permission)', async () => {
      const regularUser = await dataManager.createTestUser('REGULAR');
      const viewerRole = await dataManager.createTestRole('VIEWER'); // Assuming VIEWER doesn't have clients:create
      await dataManager.assignRoleToUser(regularUser.id!, viewerRole.id);
      const testClient = await dataManager.createTestClient('CONFIDENTIAL'); // Client for token generation
      const noCreateToken = await dataManager.createAccessToken(regularUser.id!, testClient.clientId, 'openid', []);

      const newClientData = { clientName: 'NoPermClient', clientType: ClientType.PUBLIC, redirectUris: ['http://noperm.com'] };
      const response = await httpClient.authenticatedRequest('/api/v2/clients', noCreateToken, {
        method: 'POST',
        body: JSON.stringify(newClientData),
      });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v2/clients (List Clients)', () => {
    beforeAll(async () => {
      await dataManager.createClient({ clientId: 'listclient1', clientName: 'List Client 1', clientType: ClientType.PUBLIC, redirectUris: ['http://list1.com'] });
      await dataManager.createClient({ clientId: 'listclient2', clientName: 'List Client 2', clientType: ClientType.CONFIDENTIAL, clientSecret: 'listsecret', redirectUris: ['http://list2.com'] });
    });

    it('should list clients successfully for an admin (200)', async () => {
      const response = await httpClient.authenticatedRequest('/api/v2/clients', adminToken, {
        method: 'GET',
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.clients)).toBe(true);
      expect(result.clients.length).toBeGreaterThanOrEqual(2);

      const client1 = result.clients.find((c:any) => c.clientId === 'listclient1');
      expect(client1).toBeDefined();
      expect(client1.clientName).toBe('List Client 1');
      expect(client1.clientSecret).toBeUndefined(); // Secrets should never be listed

      // Pagination fields should be present
      expect(result.total).toBeDefined();
      expect(result.page).toBeDefined();
      expect(result.pageSize).toBeDefined();
      expect(result.totalPages).toBeDefined();
    });
  });
});
