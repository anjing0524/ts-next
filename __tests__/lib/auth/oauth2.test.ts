import { ScopeUtils } from '@/lib/auth/oauth2'; // Adjust path as necessary
import { Client, Scope } from '@prisma/client'; // Assuming Client and Scope types are from Prisma
import { prisma } from '@/lib/prisma'; // Import the actual module
import { vi } from 'vitest';

// Hoisted mock for the entire module
vi.mock('@/lib/prisma');

describe('ScopeUtils.validateScopes', () => {
  let allGlobalScopes: Scope[]; // Define a base set of scopes for tests to filter

  beforeEach(() => {
    vi.resetAllMocks(); // Resets all mocks, including the mocked prisma client
    // Define a default set of all possible global scopes for tests
    allGlobalScopes = createMockGlobalScopes([
      { name: 'profile', isActive: true, isPublic: true },
      { name: 'email', isActive: true, isPublic: true },
      { name: 'orders', isActive: true, isPublic: false },
      { name: 'admin_data', isActive: true, isPublic: false },
      { name: 'inactive_scope', isActive: false, isPublic: true },
      { name: 'inactive_private_scope', isActive: false, isPublic: false },
      { name: 'another_public_scope', isActive: true, isPublic: true },
    ]);

    // Define a default set of all possible global scopes for tests
    allGlobalScopes = createMockGlobalScopes([
      { name: 'profile', isActive: true, isPublic: true },
      { name: 'email', isActive: true, isPublic: true },
      { name: 'orders', isActive: true, isPublic: false },
      { name: 'admin_data', isActive: true, isPublic: false },
      { name: 'inactive_scope', isActive: false, isPublic: true },
      { name: 'inactive_private_scope', isActive: false, isPublic: false },
      { name: 'another_public_scope', isActive: true, isPublic: true },
    ]);

    // Get the mocked prisma instance and set up its specific method implementations
    const mockedPrisma = vi.mocked(prisma, true); // true for deep mock

    mockedPrisma.scope.findMany.mockImplementation(async (args?: { where?: { name?: { in?: string[] }, isActive?: boolean } }) => {
      let result = [...allGlobalScopes];
      if (args?.where?.name?.in) {
        result = result.filter(scope => args.where!.name!.in!.includes(scope.name));
      }
      if (args?.where?.isActive !== undefined) {
        result = result.filter(scope => scope.isActive === args.where!.isActive);
      }
      return result; // Prisma findMany returns a Promise
    });

    // Mock $connect and $disconnect if they are called by setup/teardown
    mockedPrisma.$connect.mockResolvedValue(undefined as any);
    mockedPrisma.$disconnect.mockResolvedValue(undefined as any);
  });

  // Helper to create a mock Client object
  const createMockClient = (
    allowedScopes: string[] | null,
    isPublic: boolean = false
  ): Client => ({
    id: 'test-client-id',
    clientId: 'test-client',
    clientSecret: 'secret',
    redirectUris: '["http://localhost:3000/callback"]',
    grantTypes: '["authorization_code"]',
    responseTypes: '["code"]',
    allowedScopes: allowedScopes ? JSON.stringify(allowedScopes) : null,
    clientName: 'Test Client',
    clientDescription: 'A test client',
    clientType: isPublic ? 'PUBLIC' : 'CONFIDENTIAL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    logoUri: null,
    policyUri: null,
    tosUri: null,
    jwksUri: null,
    tokenEndpointAuthMethod: 'client_secret_basic',
    requirePkce: true,
    requireConsent: true,
    ipWhitelist: null,
  });

  // Helper to create mock global Scope records
  const createMockGlobalScopes = (scopes: Partial<Scope>[]): Scope[] => {
    return scopes.map(s => ({
      id: `scope-${s.name}`,
      name: s.name!,
      description: s.description || null,
      isPublic: s.isPublic || false,
      isActive: s.isActive === undefined ? true : s.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...s,
    })) as Scope[];
  };

  test('should pass if requested scopes are empty', async () => {
    const client = createMockClient(['profile', 'email'], false);
    const result = await ScopeUtils.validateScopes([], client);
    expect(result.valid).toBe(true);
    expect(result.invalidScopes).toEqual([]);
  });

  describe('Client Allowed Scopes Validation', () => {
    test('should pass if all requested scopes are in client.allowedScopes and valid globally', async () => {
      const client = createMockClient(['profile', 'email'], false);
      // Mock will use default allGlobalScopes and filter them based on prisma query
      // The query inside validateScopes will be for name IN ['profile', 'email'] AND isActive: true
      // which should correctly resolve from allGlobalScopes.
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(true);
    });

    test('should fail if a requested scope is NOT in client.allowedScopes', async () => {
      const client = createMockClient(['profile'], false); // Only 'profile' allowed
      // No need to mock prisma for this case as it should fail before DB call
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['email']);
      expect(result.error_description).toContain('not allowed for this client');
    });

    test('should fail if client.allowedScopes is empty and scopes are requested', async () => {
      const client = createMockClient([], false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    test('should fail if client.allowedScopes is null and scopes are requested', async () => {
      const client = createMockClient(null, false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    test('should handle malformed client.allowedScopes JSON gracefully (treat as no scopes allowed)', async () => {
      const client = createMockClient(null, false); // Base client
      client.allowedScopes = "this is not json"; // Override with malformed JSON

      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
      expect(result.error_description).toContain('not allowed for this client');
    });
  });

  describe('Global Scope Validity (existence and isActive)', () => {
    test('should fail if a scope allowed by client is NOT in global Scope table', async () => {
      const client = createMockClient(['profile', 'nonexistent'], false);
      // 'nonexistent' is not in allGlobalScopes, so findMany will filter it out.
      const result = await ScopeUtils.validateScopes(['profile', 'nonexistent'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['nonexistent']);
      expect(result.error_description).toContain('invalid or inactive');
    });

    test('should fail if a scope allowed by client is globally isActive=false', async () => {
      const client = createMockClient(['profile', 'inactive_scope'], false);
      // 'inactive_scope' is in allGlobalScopes but isActive:false.
      // The findMany query in validateScopes filters by isActive:true.
      const result = await ScopeUtils.validateScopes(['profile', 'inactive_scope'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['email']);
      expect(result.error_description).toContain('invalid or inactive');
    });
  });

  describe('Public Client Scope Restrictions', () => {
    test('public client: should pass if all requested scopes are client-allowed, globally valid, and public', async () => {
      const client = createMockClient(['profile', 'another_public_scope'], true); // Public client
      // Both are public and active in allGlobalScopes
      const result = await ScopeUtils.validateScopes(['profile', 'another_public_scope'], client);
      expect(result.valid).toBe(true);
    });

    test('public client: should fail if a requested scope (client-allowed, globally valid) is NOT globally isPublic=true', async () => {
      const client = createMockClient(['profile', 'orders'], true); // Public client, 'orders' is isPublic: false
      // 'orders' is active but not public in allGlobalScopes
      const result = await ScopeUtils.validateScopes(['profile', 'orders'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['admin_data']);
      expect(result.error_description).toContain('requested non-public scope(s)');
    });

    test('confidential client: should pass with mix of public/non-public scopes (if client-allowed and globally valid)', async () => {
      const client = createMockClient(['profile', 'orders'], false); // Confidential client
      // Both are active in allGlobalScopes, 'orders' is not public, but client is confidential.
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
      expect(result.error_description).toContain('not allowed for this client');
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
