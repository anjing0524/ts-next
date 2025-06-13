import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TEST_CLIENTS } from '../utils/test-helpers';
import { OAuth2ErrorTypes } from '@/lib/auth/oauth2';

// Helper function to parse URL query parameters
function parseQuery(url: string): Record<string, string> {
  const query: Record<string, string> = {};
  const queryString = url.split('?')[1];
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return query;
}

describe('OAuth授权端点单元测试 / OAuth Authorize Endpoint Unit Tests (Parameter Validation)', () => {
  let httpClient: TestHttpClient;
  let dataManager: TestDataManager;
  let testClient: any;

  beforeEach(async () => {
    httpClient = new TestHttpClient(); // Uses makeRequest which does not follow redirects by default
    dataManager = new TestDataManager();
    await dataManager.clearDatabase(); // Ensures a clean slate

    // Create a default client for tests that require a valid client_id and redirect_uri
    testClient = await dataManager.createClient({
      ...TEST_CLIENTS.PUBLIC, // Use a predefined client structure
      clientId: 'test-client-for-auth-errors',
      redirectUris: ['http://localhost:3000/callback', 'https://app.example.com/cb'],
      scope: 'openid profile email',
      responseTypes: ['code', 'token'], // Ensure 'code' is allowed
      grantTypes: ['authorization_code', 'implicit'],
      requirePkce: true, // Default to requiring PKCE for some tests
    });
  });

  afterEach(async () => {
    await dataManager.clearDatabase();
  });

  describe('GET /api/oauth/authorize - 初始参数验证 / Initial Parameter Validation', () => {
    it('TC_AU_001: 应该因缺少response_type返回400错误 / Should return 400 for missing response_type', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize?client_id=any_client&state=123', {
        method: 'GET',
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('response_type');
    });

    it('TC_AU_002: 应该因不支持的response_type重定向并附带错误 / Should redirect with error for unsupported response_type', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=unsupported&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&state=123`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302); // Expect redirect
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.UNSUPPORTED_RESPONSE_TYPE);
      expect(query.state).toBe('123');
    });

    it('TC_AU_003: 应该因缺少client_id返回400错误 / Should return 400 for missing client_id', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize?response_type=code&state=123', {
        method: 'GET',
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('client_id');
    });

    it('TC_AU_004: 应该因无效client_id返回400错误 / Should return 400 for invalid client_id (not found)', async () => {
      const response = await httpClient.makeRequest(
        '/api/oauth/authorize?response_type=code&client_id=invalid-client-id&redirect_uri=http://any.uri/cb&state=123',
        { method: 'GET', }
      );
      expect(response.status).toBe(400); // No redirect because client cannot be identified
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_CLIENT);
    });

    it('TC_AU_005: 当客户端有多个redirect_uri或需要时，应该因缺少redirect_uri返回400错误 / Should return 400 for missing redirect_uri when client has multiple or requires it', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&state=123`,
        { method: 'GET', }
      );
      expect(response.status).toBe(400); // No redirect because redirect_uri cannot be validated
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('redirect_uri');
    });

    it('TC_AU_006: 应该对未注册的redirect_uri重定向并附带错误 / Should redirect with error for unregistered redirect_uri', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=http://unregistered.uri/cb&state=xyz`,
        { method: 'GET', }
      );
      // If client identified, redirect_uri invalid -> redirect to *valid* client uri with error.
      expect(response.status).toBe(302); // Redirecting to a valid client URI
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain(testClient.redirectUris[0]); // Redirects to a known valid URI
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(query.error_description).toContain('redirect_uri'); // Specific error description
      expect(query.state).toBe('xyz');
    });

    it('TC_AU_007: 应该对客户端不允许的无效scope重定向并附带错误 / Should redirect with error for invalid scope (not allowed by client)', async () => {
      const client = await dataManager.createClient({
        ...TEST_CLIENTS.PUBLIC,
        clientId: 'scope-test-client',
        redirectUris: ['http://localhost:3000/callback'],
        scope: 'openid profile', // Allowed scopes
        responseTypes: ['code'],
        grantTypes: ['authorization_code'],
      });
      const requestedScope = 'openid profile email'; // email is not allowed
      const state = 'scope_state';
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${client.clientId}&redirect_uri=http://localhost:3000/callback&scope=${requestedScope}&state=${state}`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_SCOPE);
      expect(query.error_description).toContain('email'); // Should mention the problematic scope
      expect(query.state).toBe(state);
    });

    it('TC_AU_008: 应该对包含换行符等无效scope格式重定向并附带错误 / Should redirect with error for invalid scope format (e.g. contains newline)', async () => {
      const stateVal = "newlinestate";
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&scope=openid\nprofile&state=${stateVal}`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_SCOPE);
      expect(query.state).toBe(stateVal);
    });

    // PKCE Tests
    it('TC_AU_009: 当客户端需要PKCE但缺少code_challenge时，应该重定向并附带错误 / Should redirect with error if client requires PKCE and code_challenge is missing', async () => {
      const stateVal = "pkce_missing_challenge";
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&scope=openid&state=${stateVal}`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(query.error_description).toContain('code_challenge');
      expect(query.state).toBe(stateVal);
    });

    it('TC_AU_010: 应该对不支持的code_challenge_method重定向并附带错误 / Should redirect with error for unsupported code_challenge_method (not S256)', async () => {
      const stateVal = "pkce_bad_method";
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&scope=openid&code_challenge=somechallenge&code_challenge_method=plain&state=${stateVal}`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(query.error_description).toContain('code_challenge_method');
      expect(query.state).toBe(stateVal);
    });

    it('TC_AU_011: 应该对无效code_challenge格式重定向并附带错误 / Should redirect with error for invalid code_challenge format (e.g. too short)', async () => {
        const stateVal = "pkce_short_challenge";
        const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&scope=openid&code_challenge=short&code_challenge_method=S256&state=${stateVal}`,
        { method: 'GET', }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(query.error_description).toContain('code_challenge'); // Assuming error message mentions code_challenge
      expect(query.state).toBe(stateVal);
    });

    it('TC_AU_012: 应该正确处理OPTIONS请求 / Should correctly handle OPTIONS request', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize', { method: 'OPTIONS' });
      expect(response.status).toBe(200); // Or 204
      // Further checks for Allow header could be added if necessary for the application.
    });

    it('TC_AU_013: 应该对不支持的HTTP方法返回405错误 / Should return 405 for unsupported HTTP methods like DELETE', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize', { method: 'DELETE' });
      expect(response.status).toBe(405);
      const data = await response.json();
      expect(data.error).toBe('method_not_allowed'); // Standard error for 405
    });
  });
});
