// __tests__/lib/auth/clientCredentialsFlow.test.ts

import { prisma } from '@/lib/prisma';
import {
  authenticateClient,
  grantClientCredentialsToken,
  AuthenticatedClient,
} from '@/lib/auth/clientCredentialsFlow';
import { generateJwtToken, validateJwtToken, __test__resetKeys as resetJwtKeys } from '@/lib/auth/jwtUtils';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../utils/test-helpers';
import bcrypt from 'bcrypt';

// Mock jwtUtils for grantClientCredentialsToken tests if needed,
// or use actual jwtUtils if its dependencies (keys) are correctly set up for tests.
// For now, we assume jwtUtils will work given the env vars are set by test-helpers or this file.

// Set up JWT environment variables for jwtUtils (if not already globally set by another test file's import)
// These should match what jwtUtils expects.
const TEST_RSA_PRIVATE_KEY_PEM_CLIENT_CRED =
  process.env.JWT_RSA_PRIVATE_KEY || // Use existing if defined by jwtUtils.test.ts run
  `-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDRs5+x9V8xDRN9
7VbVXpQY9T7yT2VmszP9/gBsGgDY8xJ0gYJ8Z8SgN9xS2uV/c1A8j52yrHFo3nZuV
OXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y
8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZCAwEAAQKBgQCOLc5+L5rN42gY
V7PqN9xS2uV/c1A8j52yrHFo3nZuVOXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGB
APyZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8ZAoGBAPZZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAO5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAZ5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGARpZ7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z-----END RSA PRIVATE KEY-----`;

const TEST_RSA_PUBLIC_KEY_PEM_CLIENT_CRED =
  process.env.JWT_RSA_PUBLIC_KEY ||
  `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0bOfsfVfMQ0Tfe1W1V6U
GPU+8k9lZrMz/f4AbBoA2PMSdIGCfGfEoDfcUtblf3NQPI+dsqxxaN52blTl5Vtm
MdpcpmdGfTvWO39me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGQIDAQAB
-----END PUBLIC KEY-----`;

process.env.JWT_RSA_PRIVATE_KEY = TEST_RSA_PRIVATE_KEY_PEM_CLIENT_CRED;
process.env.JWT_RSA_PUBLIC_KEY = TEST_RSA_PUBLIC_KEY_PEM_CLIENT_CRED;
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'test-issuer-client-cred';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'test-audience-client-cred';


describe('Client Credentials Flow', () => {
  let testDataCreator: TestDataManager;
  let confidentialClientData: any; // to store raw client data from TestDataManager
  let publicClientData: any;
  const confidentialClientSecret = 'confidential_super_secret_123';
  const defaultAllowedScopes = JSON.stringify(['read:data', 'write:data']);

  beforeAll(async () => {
    await setupTestDb();
    await resetJwtKeys(); // Ensure jwtUtils uses the env vars set here
  });

  beforeEach(async () => {
    testDataCreator = new TestDataManager('client_cred_flow_');

    // Create a confidential client
    confidentialClientData = await testDataCreator.createClient({
      clientId: 'confidential-test-client',
      clientSecret: confidentialClientSecret, // TestDataManager will hash this
      isPublic: false,
      name: 'Confidential Client App',
      scope: JSON.parse(defaultAllowedScopes), // createClient expects array
    });

    // Create a public client
    publicClientData = await testDataCreator.createClient({
      clientId: 'public-test-client',
      isPublic: true,
      name: 'Public Client App',
      scope: JSON.parse(defaultAllowedScopes),
    });
  });

  afterEach(async () => {
    await testDataCreator.cleanup();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('authenticateClient', () => {
    it('should authenticate a valid confidential client with correct secret', async () => {
      const authenticated = await authenticateClient(
        confidentialClientData.clientId,
        confidentialClientData.plainSecret, // Use plainSecret from TestDataManager which it stored
      );
      expect(authenticated).not.toBeNull();
      expect(authenticated?.clientId).toBe(confidentialClientData.clientId);
      expect(authenticated?.name).toBe(confidentialClientData.name);
      expect(authenticated?.clientType).toBe('CONFIDENTIAL');
    });

    it('should not authenticate a confidential client with incorrect secret', async () => {
      const authenticated = await authenticateClient(
        confidentialClientData.clientId,
        'wrong_secret_shhhh',
      );
      expect(authenticated).toBeNull();
    });

    it('should not authenticate a confidential client if no secret is provided', async () => {
      const authenticated = await authenticateClient(confidentialClientData.clientId);
      expect(authenticated).toBeNull();
    });

    it('should authenticate a valid public client (even if secret is provided, it should be ignored)', async () => {
      const authenticated = await authenticateClient(
        publicClientData.clientId,
        'some_random_secret_for_public', // Public clients ignore secrets
      );
      expect(authenticated).not.toBeNull();
      expect(authenticated?.clientId).toBe(publicClientData.clientId);
      expect(authenticated?.clientType).toBe('PUBLIC');
    });

    it('should authenticate a valid public client if no secret is provided', async () => {
      const authenticated = await authenticateClient(publicClientData.clientId);
      expect(authenticated).not.toBeNull();
      expect(authenticated?.clientId).toBe(publicClientData.clientId);
      expect(authenticated?.clientType).toBe('PUBLIC');
    });

    it('should return null for a non-existent client ID', async () => {
      const authenticated = await authenticateClient('non-existent-client-12345', 'any_secret');
      expect(authenticated).toBeNull();
    });

    it('should return null for an inactive client', async () => {
      // Make confidential client inactive
      await prisma.oAuthClient.update({
        where: { clientId: confidentialClientData.clientId },
        data: { isActive: false },
      });
      const authenticated = await authenticateClient(
        confidentialClientData.clientId,
        confidentialClientData.plainSecret,
      );
      expect(authenticated).toBeNull();
    });
  });

  describe('grantClientCredentialsToken', () => {
    let authenticatedConfClient: AuthenticatedClient;

    beforeEach(async () => {
      // Authenticate the client first to get the AuthenticatedClient object
      const authResult = await authenticateClient(
        confidentialClientData.clientId,
        confidentialClientData.plainSecret,
      );
      if (!authResult) throw new Error('Setup failed: Could not authenticate confidential client');
      authenticatedConfClient = authResult;
    });

    it('should grant a token for an authenticated confidential client', async () => {
      const token = await grantClientCredentialsToken(authenticatedConfClient);
      expect(typeof token).toBe('string');

      const { payload } = await validateJwtToken(token); // Using actual validate function
      expect(payload.sub).toBe(authenticatedConfClient.clientId);
      expect(payload.iss).toBe(process.env.JWT_ISSUER);
      expect(payload.aud).toBe(process.env.JWT_AUDIENCE);
      expect(payload.scope).toBe(JSON.parse(defaultAllowedScopes).join(' ')); // Default scopes
    });

    it('should grant a token with requested scopes if they are within allowed scopes', async () => {
      const requestedScope = 'read:data'; // This scope is in defaultAllowedScopes
      const token = await grantClientCredentialsToken(authenticatedConfClient, requestedScope);
      const { payload } = await validateJwtToken(token);
      expect(payload.scope).toBe(requestedScope);
    });

    it('should use all allowed scopes if no specific scope is requested', async () => {
      const token = await grantClientCredentialsToken(authenticatedConfClient);
      const { payload } = await validateJwtToken(token);
      expect(payload.scope).toBe(JSON.parse(defaultAllowedScopes).join(' '));
    });

    it('should throw an error if requested scope is not allowed for the client', async () => {
      const requestedScope = 'admin:access read:data'; // admin:access is not in defaultAllowedScopes
      await expect(
        grantClientCredentialsToken(authenticatedConfClient, requestedScope),
      ).rejects.toThrow('Invalid scope: Requested scope exceeds client\'s allowed scopes.');
    });

    it('should handle client with no allowed scopes correctly (e.g. grant token with no scope claim or specific default)', async () => {
        // Update client to have no scopes
        const clientWithNoScopesRaw = await testDataCreator.createClient({
            clientId: 'client-no-scopes',
            isPublic: false,
            clientSecret: 'secret',
            scope: [] // No scopes allowed
        });
        const authClientNoScopes = await authenticateClient(clientWithNoScopesRaw.clientId, clientWithNoScopesRaw.plainSecret);
        if(!authClientNoScopes) throw new Error("Failed to auth client with no scopes");

        // Behavior depends on policy: grant empty scope vs. error. Current impl grants empty.
        const token = await grantClientCredentialsToken(authClientNoScopes);
        const { payload } = await validateJwtToken(token);
        expect(payload.scope).toBe(''); // Or expect specific default if policy changes
    });

    it('should use client-specific accessTokenTtl if configured', async () => {
        const customTtl = 15 * 60; // 15 minutes
        await prisma.oAuthClient.update({
            where: { id: authenticatedConfClient.id },
            data: { accessTokenTtl: customTtl }
        });
        // Re-authenticate to get updated client data if necessary, or add ttl to AuthenticatedClient type
        const updatedAuthClient = { ...authenticatedConfClient, accessTokenTtl: customTtl };


        const token = await grantClientCredentialsToken(updatedAuthClient);
        const { payload } = await validateJwtToken(token);

        const nowInSeconds = Math.floor(Date.now() / 1000);
        expect(payload.exp).toBeDefined();
        expect(payload.exp).toBeGreaterThanOrEqual(nowInSeconds + customTtl - 5);
        expect(payload.exp).toBeLessThanOrEqual(nowInSeconds + customTtl + 5);
    });
  });
});
