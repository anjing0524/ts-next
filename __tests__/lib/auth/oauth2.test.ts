import { ScopeUtils } from '@/lib/auth/oauth2'; // Adjust path as necessary
import { Client } from '@prisma/client'; // Assuming Client and Scope types are from Prisma
import { TestDataManager, TestScope, TestClient } from '__tests__/utils/test-helpers';
import { vi } from 'vitest';

// vi.mock('@/lib/prisma'); // REMOVED: We are using a real database connection

describe('ScopeUtils.validateScopes', () => {
  let testDataManager: TestDataManager;

  beforeAll(() => {
    testDataManager = new TestDataManager('oauth2-scope-utils-test'); // Reverted: No longer passing prisma
  });

  // Define a base set of scope properties for tests
  const globalScopeDefinitions: Partial<TestScope>[] = [
    { name: 'profile', isActive: true, isPublic: true, description: 'Profile scope' },
    { name: 'email', isActive: true, isPublic: true, description: 'Email scope' },
    { name: 'orders', isActive: true, isPublic: false, description: 'Orders scope' },
    { name: 'admin_data', isActive: true, isPublic: false, description: 'Admin Data scope' },
    { name: 'inactive_scope', isActive: false, isPublic: true, description: 'Inactive Public scope' },
    { name: 'inactive_private_scope', isActive: false, isPublic: false, description: 'Inactive Private scope' },
    { name: 'another_public_scope', isActive: true, isPublic: true, description: 'Another Public scope' },
  ];

  beforeEach(async () => {
    vi.resetAllMocks(); // Still useful for other potential mocks, though Prisma is not mocked.
    await testDataManager.cleanup(); // Clear data from previous tests

    // Create global scopes in the database
    for (const scopeDef of globalScopeDefinitions) {
      await testDataManager.createScope(scopeDef);
    }
  });

  afterAll(async () => {
    await testDataManager.cleanup(); // Clean up all data created by this test suite
  });

  // Helper to create a Client object in the DB
  const createDbClient = async (
    allowedScopes: string[] | null,
    isPublic: boolean = false,
    clientOverrides: Partial<TestClient> = {}
  ): Promise<Client> => {
    const clientData: Partial<TestClient> = {
      clientId: `test-client-${Date.now()}-${Math.random()}`, // Ensure unique clientId
      name: 'Test Client',
      redirectUris: ['http://localhost:3000/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: allowedScopes || [], // TestDataManager expects string[]
      isPublic,
      isActive: true,
      ...clientOverrides,
    };
    // Type assertion because TestDataManager returns its own TestClient,
    // but ScopeUtils.validateScopes expects a Prisma Client.
    // The structures should be compatible enough for the function's needs.
    // If not, a more specific mapping or adjustment in ScopeUtils might be needed.
    return (await testDataManager.createClient(clientData)) as unknown as Client;
  };

  test('should pass if requested scopes are empty', async () => {
    const client = await createDbClient(['profile', 'email'], false);
    const result = await ScopeUtils.validateScopes([], client);
    expect(result.valid).toBe(true);
    expect(result.invalidScopes).toEqual([]);
  });

  describe('Client Allowed Scopes Validation', () => {
    test('should pass if all requested scopes are in client.allowedScopes and valid globally', async () => {
      const client = await createDbClient(['profile', 'email'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(true);
    });

    test('should fail if a requested scope is NOT in client.allowedScopes', async () => {
      const client = await createDbClient(['profile'], false); // Only 'profile' allowed
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['email']);
      expect(result.error_description).toContain('not allowed for this client');
    });

    test('should fail if client.allowedScopes is empty and scopes are requested', async () => {
      const client = await createDbClient([], false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    test('should fail if client.allowedScopes is null (empty array from helper) and scopes are requested', async () => {
      // TestDataManager's createClient converts null scope to [], so this tests empty allowedScopes
      const client = await createDbClient(null, false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    test('should handle malformed client.allowedScopes JSON gracefully (treat as no scopes allowed)', async () => {
      // To test this, we need to create a client with valid scopes, then manually update it to have malformed JSON.
      // However, `ScopeUtils` expects a Prisma `Client` type, which has `allowedScopes` as `string | null`.
      // `TestDataManager.createClient` stores it as a JSON string internally.
      // The `validateScopes` function parses this JSON string.
      // For this specific test, we'll create a client and then simulate the malformed part.
      // This is tricky because the TestDataManager correctly creates JSON.
      // We'll assume that if `client.allowedScopes` was somehow set to invalid JSON, it would be caught.
      // The existing logic in `validateScopes` for parsing `client.allowedScopes` should handle this.
      // Let's simulate by creating a client with specific valid scopes, then overriding that property on the fetched object.
      const clientWithValidScopes = await createDbClient(['valid'], false);

      // Simulate malformed JSON for allowedScopes. This is what would happen if the DB had bad data.
      const malformedClient = {
        ...clientWithValidScopes,
        allowedScopes: 'this is not json string', // Prisma Client type is `string | null` for allowedScopes
      };

      const result = await ScopeUtils.validateScopes(['profile'], malformedClient as Client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
      expect(result.error_description).toContain('not allowed for this client');
    });
  });

  describe('Global Scope Validity (existence and isActive)', () => {
    test('should fail if a scope allowed by client is NOT in global Scope table', async () => {
      const client = await createDbClient(['profile', 'nonexistent_scope_xyz123'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'nonexistent_scope_xyz123'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['nonexistent_scope_xyz123']);
      expect(result.error_description).toContain('invalid or inactive');
    });

    test('should fail if a scope allowed by client is globally isActive=false', async () => {
      const client = await createDbClient(['profile', 'inactive_scope'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'inactive_scope'], client);
      expect(result.valid).toBe(false);
      // The current implementation of ScopeUtils.validateScopes fetches scopes that are active.
      // If 'inactive_scope' is requested and it's inactive, it won't be found by the query.
      // Thus, it's treated as an invalid/non-existent scope.
      expect(result.invalidScopes).toEqual(['inactive_scope']);
      expect(result.error_description).toContain('invalid or inactive');
    });
  });

  describe('Public Client Scope Restrictions', () => {
    test('public client: should pass if all requested scopes are client-allowed, globally valid, and public', async () => {
      const client = await createDbClient(['profile', 'another_public_scope'], true); // Public client
      const result = await ScopeUtils.validateScopes(['profile', 'another_public_scope'], client);
      expect(result.valid).toBe(true);
    });

    test('public client: should fail if a requested scope (client-allowed, globally valid) is NOT globally isPublic=true', async () => {
      const client = await createDbClient(['profile', 'orders'], true); // Public client, 'orders' is isPublic: false
      const result = await ScopeUtils.validateScopes(['profile', 'orders'], client);
      expect(result.valid).toBe(false);
      // 'orders' is the non-public scope.
      expect(result.invalidScopes).toEqual(['orders']);
      expect(result.error_description).toContain('requested non-public scope(s)');
    });

    test('confidential client: should pass with mix of public/non-public scopes (if client-allowed and globally valid)', async () => {
      const client = await createDbClient(['profile', 'orders'], false); // Confidential client
      const result = await ScopeUtils.validateScopes(['profile', 'orders'], client);
      expect(result.valid).toBe(true);
    });
  });

  describe('Simple string array validation (for client_credentials)', () => {
    test('should pass if all requested scopes are in the allowed list', () => {
      const allowed = ['scope1', 'scope2'];
      const requested = ['scope1'];
      const result = ScopeUtils.validateScopes(requested, allowed);
      expect(result.valid).toBe(true);
    });

    test('should fail if a requested scope is not in the allowed list', () => {
      const allowed = ['scope1', 'scope2'];
      const requested = ['scope1', 'scope3'];
      const result = ScopeUtils.validateScopes(requested, allowed);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['scope3']);
      // error_description is not set in this overload, so the check is removed.
      // The core validation (valid: false, invalidScopes: ['scope3']) is what matters here.
    });
  });
});

describe('Other ScopeUtils functions (basic checks)', () => {
  test('parseScopes correctly splits and filters scope string', () => {
    expect(ScopeUtils.parseScopes('profile email phone')).toEqual(['profile', 'email', 'phone']);
    expect(ScopeUtils.parseScopes('profile  email')).toEqual(['profile', 'email']); // Handles multiple spaces
    expect(ScopeUtils.parseScopes('')).toEqual([]);
    expect(ScopeUtils.parseScopes(undefined)).toEqual([]);
    expect(ScopeUtils.parseScopes('single')).toEqual(['single']);
  });

  test('formatScopes correctly joins scopes array', () => {
    expect(ScopeUtils.formatScopes(['profile', 'email', 'phone'])).toBe('profile email phone');
    expect(ScopeUtils.formatScopes([])).toBe('');
  });

  test('hasScope works correctly', () => {
    const userScopes = ['profile', 'email'];
    expect(ScopeUtils.hasScope(userScopes, 'email')).toBe(true);
    expect(ScopeUtils.hasScope(userScopes, 'address')).toBe(false);
  });

  test('hasAnyScope works correctly', () => {
    const userScopes = ['profile', 'email'];
    expect(ScopeUtils.hasAnyScope(userScopes, ['email', 'address'])).toBe(true);
    expect(ScopeUtils.hasAnyScope(userScopes, ['orders', 'address'])).toBe(false);
  });

  test('hasAllScopes works correctly', () => {
    const userScopes = ['profile', 'email', 'phone'];
    expect(ScopeUtils.hasAllScopes(userScopes, ['email', 'profile'])).toBe(true);
    expect(ScopeUtils.hasAllScopes(userScopes, ['email', 'address'])).toBe(false);
  });
});
