import { ScopeUtils } from '@/lib/auth/oauth2';
import { Client } from '@prisma/client';
import { TestDataManager, TestScope, TestClient } from '__tests__/utils/test-helpers';
import { vi } from 'vitest';

describe('OAuth2 核心逻辑库 - ScopeUtils.validateScopes / OAuth2 Core Library - ScopeUtils.validateScopes', () => {
  let testDataManager: TestDataManager;

  beforeAll(() => {
    testDataManager = new TestDataManager('oauth2-scope-utils-test');
  });

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
    await testDataManager.cleanup();
  });

  const createDbClient = async (allowedScopes: string[] | null, isPublic: boolean = false, clientOverrides: Partial<TestClient> = {}): Promise<Client> => {
    const clientData: Partial<TestClient> = {
      clientId: `test-client-${Date.now()}-${Math.random()}`, name: 'Test Client', redirectUris: ['http://localhost:3000/callback'],
      grantTypes: ['authorization_code'], responseTypes: ['code'], scope: allowedScopes || [], isPublic, isActive: true, ...clientOverrides,
    };
    return (await testDataManager.createClient(clientData)) as unknown as Client;
  };

  it('TC_LAO_001_001: 如果请求的作用域为空，则应通过 / Should pass if requested scopes are empty', async () => {
    const client = await createDbClient(['profile', 'email'], false);
    const result = await ScopeUtils.validateScopes([], client);
    expect(result.valid).toBe(true);
    expect(result.invalidScopes).toEqual([]);
  });

  describe('客户端允许的作用域验证 / Client Allowed Scopes Validation', () => {
    it('TC_LAO_002_001: 如果所有请求的作用域都在客户端allowedScopes中且全局有效，则应通过 / Should pass if all requested scopes are in client.allowedScopes and valid globally', async () => {
      const client = await createDbClient(['profile', 'email'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(true);
    });

    it('TC_LAO_002_002: 如果请求的作用域不在客户端allowedScopes中，则应失败 / Should fail if a requested scope is NOT in client.allowedScopes', async () => {
      const client = await createDbClient(['profile'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'email'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['email']);
      expect(result.error_description).toContain('not allowed for this client');
    });

    it('TC_LAO_002_003: 如果客户端allowedScopes为空且请求了作用域，则应失败 / Should fail if client.allowedScopes is empty and scopes are requested', async () => {
      const client = await createDbClient([], false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    it('TC_LAO_002_004: 如果客户端allowedScopes为null且请求了作用域，则应失败 / Should fail if client.allowedScopes is null and scopes are requested', async () => {
      const client = await createDbClient(null, false);
      const result = await ScopeUtils.validateScopes(['profile'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
    });

    it('TC_LAO_002_005: 应优雅处理格式错误的client.allowedScopes JSON（视为无允许作用域）/ Should handle malformed client.allowedScopes JSON gracefully (treat as no scopes allowed)', async () => {
      const clientWithValidScopes = await createDbClient(['valid'], false);
      const malformedClient = { ...clientWithValidScopes, allowedScopes: 'this is not json string' };
      const result = await ScopeUtils.validateScopes(['profile'], malformedClient as Client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['profile']);
      expect(result.error_description).toContain('not allowed for this client');
    });
  });

  describe('全局作用域有效性（存在性和isActive）/ Global Scope Validity (existence and isActive)', () => {
    it('TC_LAO_003_001: 如果客户端允许的作用域在全局Scope表中不存在，则应失败 / Should fail if a scope allowed by client is NOT in global Scope table', async () => {
      const client = await createDbClient(['profile', 'nonexistent_scope_xyz123'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'nonexistent_scope_xyz123'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['nonexistent_scope_xyz123']);
      expect(result.error_description).toContain('invalid or inactive');
    });

    it('TC_LAO_003_002: 如果客户端允许的作用域全局isActive=false，则应失败 / Should fail if a scope allowed by client is globally isActive=false', async () => {
      const client = await createDbClient(['profile', 'inactive_scope'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'inactive_scope'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['inactive_scope']);
      expect(result.error_description).toContain('invalid or inactive');
    });
  });

  describe('公共客户端作用域限制 / Public Client Scope Restrictions', () => {
    it('TC_LAO_004_001: 公共客户端：如果所有请求的作用域都得到客户端允许、全局有效且公开，则应通过 / Public client: should pass if all requested scopes are client-allowed, globally valid, and public', async () => {
      const client = await createDbClient(['profile', 'another_public_scope'], true);
      const result = await ScopeUtils.validateScopes(['profile', 'another_public_scope'], client);
      expect(result.valid).toBe(true);
    });

    it('TC_LAO_004_002: 公共客户端：如果请求的作用域（客户端允许、全局有效）全局isPublic=false，则应失败 / Public client: should fail if a requested scope (client-allowed, globally valid) is NOT globally isPublic=true', async () => {
      const client = await createDbClient(['profile', 'orders'], true);
      const result = await ScopeUtils.validateScopes(['profile', 'orders'], client);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['orders']);
      expect(result.error_description).toContain('requested non-public scope(s)');
    });

    it('TC_LAO_004_003: 机密客户端：应通过公共/非公共作用域的混合（如果客户端允许且全局有效）/ Confidential client: should pass with mix of public/non-public scopes (if client-allowed and globally valid)', async () => {
      const client = await createDbClient(['profile', 'orders'], false);
      const result = await ScopeUtils.validateScopes(['profile', 'orders'], client);
      expect(result.valid).toBe(true);
    });
  });

  describe('简单字符串数组验证（用于client_credentials）/ Simple string array validation (for client_credentials)', () => {
    it('TC_LAO_005_001: 如果所有请求的作用域都在允许列表中，则应通过 / Should pass if all requested scopes are in the allowed list', () => {
      const allowed = ['scope1', 'scope2'];
      const requested = ['scope1'];
      const result = ScopeUtils.validateScopes(requested, allowed);
      expect(result.valid).toBe(true);
    });

    it('TC_LAO_005_002: 如果请求的作用域不在允许列表中，则应失败 / Should fail if a requested scope is not in the allowed list', () => {
      const allowed = ['scope1', 'scope2'];
      const requested = ['scope1', 'scope3'];
      const result = ScopeUtils.validateScopes(requested, allowed);
      expect(result.valid).toBe(false);
      expect(result.invalidScopes).toEqual(['scope3']);
    });
  });
});

describe('OAuth2 核心逻辑库 - 其他ScopeUtils函数 / OAuth2 Core Library - Other ScopeUtils functions', () => {
  it('TC_LAO_006_001: parseScopes应正确拆分和过滤作用域字符串 / parseScopes correctly splits and filters scope string', () => {
    expect(ScopeUtils.parseScopes('profile email phone')).toEqual(['profile', 'email', 'phone']);
    expect(ScopeUtils.parseScopes('profile  email')).toEqual(['profile', 'email']);
    expect(ScopeUtils.parseScopes('')).toEqual([]);
    expect(ScopeUtils.parseScopes(undefined)).toEqual([]);
    expect(ScopeUtils.parseScopes('single')).toEqual(['single']);
  });

  it('TC_LAO_006_002: formatScopes应正确连接作用域数组 / formatScopes correctly joins scopes array', () => {
    expect(ScopeUtils.formatScopes(['profile', 'email', 'phone'])).toBe('profile email phone');
    expect(ScopeUtils.formatScopes([])).toBe('');
  });

  it('TC_LAO_006_003: hasScope应正确工作 / hasScope works correctly', () => {
    const userScopes = ['profile', 'email'];
    expect(ScopeUtils.hasScope(userScopes, 'email')).toBe(true);
    expect(ScopeUtils.hasScope(userScopes, 'address')).toBe(false);
  });

  it('TC_LAO_006_004: hasAnyScope应正确工作 / hasAnyScope works correctly', () => {
    const userScopes = ['profile', 'email'];
    expect(ScopeUtils.hasAnyScope(userScopes, ['email', 'address'])).toBe(true);
    expect(ScopeUtils.hasAnyScope(userScopes, ['orders', 'address'])).toBe(false);
  });

  it('TC_LAO_006_005: hasAllScopes应正确工作 / hasAllScopes works correctly', () => {
    const userScopes = ['profile', 'email', 'phone'];
    expect(ScopeUtils.hasAllScopes(userScopes, ['email', 'profile'])).toBe(true);
    expect(ScopeUtils.hasAllScopes(userScopes, ['email', 'address'])).toBe(false);
  });
});
