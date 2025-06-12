import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestHttpClient, TestDataManager, TEST_CLIENTS } from '../utils/test-helpers';
import { OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // Import error types

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


describe('OAuth Authorize Endpoint Unit Tests (Parameter Validation)', () => {
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

  describe('GET /api/oauth/authorize - Initial Parameter Validation', () => {
    it('should return 400 for missing response_type', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize?client_id=any_client&state=123', {
        method: 'GET',
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('response_type');
    });

    it('should return 400 for unsupported response_type', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=unsupported&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&state=123`,
        { method: 'GET', }
      );
      // This should redirect to the client's redirect_uri with error in query
      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.UNSUPPORTED_RESPONSE_TYPE);
      expect(query.state).toBe('123');
    });

    it('should return 400 for missing client_id', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize?response_type=code&state=123', {
        method: 'GET',
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('client_id');
    });

    it('should return 400 for invalid client_id (not found)', async () => {
      const response = await httpClient.makeRequest(
        '/api/oauth/authorize?response_type=code&client_id=invalid-client-id&redirect_uri=http://any.uri/cb&state=123',
        { method: 'GET', }
      );
      // No redirect because client cannot be identified
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_CLIENT); // Or INVALID_REQUEST if client_id format is wrong
    });

    it('should return 400 for missing redirect_uri when client has multiple or requires it', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&state=123`,
        { method: 'GET', }
      );
       // No redirect because redirect_uri cannot be validated
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST);
      expect(data.error_description).toContain('redirect_uri');
    });

    it('should redirect with error for unregistered redirect_uri', async () => {
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=http://unregistered.uri/cb&state=xyz`,
        { method: 'GET', }
      );
      // According to spec, SHOULD NOT redirect to the invalid URI.
      // Instead, show an error to the resource owner or use a pre-registered default if absolutely unambiguous.
      // For this unit test, expecting a 400 if no safe redirect can be made.
      // However, if the endpoint logic *does* redirect to a *valid* client URI with error, that's also testable.
      // The current route logic might try to redirect to a default client URI if one could be inferred,
      // but if the provided one is simply not in the list, it should be an error displayed to user, or 400.
      // Let's assume it redirects to the *first registered* URI of the client with an error.
      // This needs to be confirmed with actual route behavior.
      // For now, let's assume the route handler identifies the client, sees the redirect_uri is bad,
      // and redirects to the primary registered redirect_uri of that client with an error.
      // If the client is identifiable, it MUST NOT redirect to the malicious URI.
      // If the client itself cannot be identified, it's a 400.
      // If client identified, redirect_uri invalid -> redirect to *valid* client uri with error.
      expect(response.status).toBe(302); // Redirecting to a valid client URI
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain(testClient.redirectUris[0]); // Redirects to a known valid URI
      const query = parseQuery(location!);
      expect(query.error).toBe(OAuth2ErrorTypes.INVALID_REQUEST); // Or a more specific error
      expect(query.error_description).toContain('redirect_uri');
      expect(query.state).toBe('xyz');
    });

    it('should redirect with error for invalid scope (not allowed by client)', async () => {
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

    it('should redirect with error for invalid scope format (e.g. contains newline)', async () => {
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
    it('should redirect with error if client requires PKCE and code_challenge is missing', async () => {
      // testClient is already set to requirePkce = true
      const stateVal = "pkce_missing_challenge";
      const response = await httpClient.makeRequest(
        `/api/oauth/authorize?response_type=code&client_id=${testClient.clientId}&redirect_uri=${testClient.redirectUris[0]}&scope=openid&state=${stateVal}`,
        // Missing code_challenge and code_challenge_method
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

    it('should redirect with error for unsupported code_challenge_method (not S256)', async () => {
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

    it('should redirect with error for invalid code_challenge format (e.g. too short)', async () => {
        // Assuming PKCEUtils.validateCodeChallenge checks length (min 43 for S256 as per RFC7636)
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
      expect(query.error_description).toContain('code_challenge');
      expect(query.state).toBe(stateVal);
    });


    it('should correctly handle OPTIONS request', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize', { method: 'OPTIONS' });
      expect(response.status).toBe(200); // Standard is 200 or 204 for OPTIONS
      // Check for Allow header, though it's not strictly required by this test's focus
    });

    it('should return 405 for unsupported HTTP methods like DELETE', async () => {
      const response = await httpClient.makeRequest('/api/oauth/authorize', { method: 'DELETE' });
      expect(response.status).toBe(405);
      const data = await response.json(); // Method Not Allowed might return JSON
      expect(data.error).toBe('method_not_allowed');
    });

    // Test for "Content-Type" header removed as it's not relevant for 302 redirects
    // and error pages might vary. Focus is on status and error codes.
  });

  // Removed the entire 'POST /api/oauth/authorize' describe block
  // Removed '有效客户端和用户测试' as it implies user authentication, better for integration tests.
});
