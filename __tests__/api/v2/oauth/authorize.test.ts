// __tests__/api/v2/oauth/authorize.test.ts

import { GET } from '@/app/api/v2/oauth/authorize/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../../utils/test-helpers';
import { OAuthClient } from '@prisma/client';

// Mock a minimal NextRequest
function mockNextRequest(searchParams: URLSearchParams, cookies?: any): NextRequest {
  const url = `http://localhost/api/v2/oauth/authorize?${searchParams.toString()}`;
  const request = {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
    cookies: { // Mock cookies if needed for session tests
      get: (name: string) => cookies?.[name] ? ({ name, value: cookies[name] }) : undefined,
      ...cookies
    },
    // Add other properties if your route handler uses them
  } as NextRequest;
  return request;
}

describe('/api/v2/oauth/authorize GET', () => {
  let testDataCreator: TestDataManager;
  let client: OAuthClient;
  const defaultRedirectUri = 'https://client.example.com/callback';
  const defaultClientId = 'test-auth-client-id';
  const defaultCodeChallenge = 'Yf4T1n1X7w5cT8zK9o7pA6sR3jB2vN1L0gD8eF5hC2k'; // Valid base64url SHA256, 43 chars
  const defaultScope = 'openid profile';

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    testDataCreator = new TestDataManager('authorize_route_test_');
    const rawClient = await testDataCreator.createClient({
      clientId: defaultClientId,
      name: 'Test Authorize Client',
      redirectUris: [defaultRedirectUri, 'https://another.uri/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read'],
      isPublic: true, // PKCE is important for public clients
    });
    // Fetch the actual client from DB to ensure we have the CUID id
    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: rawClient.clientId } });
    if (!dbClient) throw new Error("Test client setup failed");
    client = dbClient;
  });

  afterEach(async () => {
    await testDataCreator.cleanup();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Parameter Validation Errors (using buildErrorRedirect or JSON error)', () => {
    it('should return 400 if client_id is missing', async () => {
      const params = new URLSearchParams({
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('client_id: client_id is required');
    });

    it('should return 400 if redirect_uri is missing', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId, // Use the string clientId from the created client
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('redirect_uri: redirect_uri is required');
    });

    it('should return 400 if redirect_uri is not a valid URL', async () => {
        const params = new URLSearchParams({
            client_id: client.clientId,
            redirect_uri: 'not-a-valid-url',
            response_type: 'code',
            scope: defaultScope,
            code_challenge: defaultCodeChallenge,
            code_challenge_method: 'S256',
        });
        const req = mockNextRequest(params);
        const response = await GET(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_request');
        expect(json.error_description).toContain('redirect_uri: Invalid url');
      });

    it('should return 400 if response_type is not "code"', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: defaultRedirectUri,
        response_type: 'token', // Invalid response_type
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('response_type: response_type must be \'code\'');
    });

    it('should return error (redirect) if scope is missing', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
        state: 'teststate123'
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      // This should redirect with error because redirect_uri is valid
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('error=invalid_scope');
      expect(location).toContain('error_description=Scope+parameter+is+required');
      expect(location).toContain(`state=teststate123`);
    });


    it('should return 400 if code_challenge is missing', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        scope: defaultScope,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('code_challenge: code_challenge is required for PKCE');
    });

    it('should return 400 if code_challenge is too short', async () => {
        const params = new URLSearchParams({
          client_id: client.clientId,
          redirect_uri: defaultRedirectUri,
          response_type: 'code',
          scope: defaultScope,
          code_challenge: 'short', // Invalid
          code_challenge_method: 'S256',
        });
        const req = mockNextRequest(params);
        const response = await GET(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_request');
        expect(json.error_description).toContain('code_challenge: code_challenge must be at least 43 characters');
      });

    it('should return 400 if code_challenge_method is not "S256"', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'plain', // Invalid
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('code_challenge_method: code_challenge_method must be \\"S256\\"');
    });
  });

  describe('Client Validation Errors', () => {
    it('should return 400 if client_id is not found', async () => {
      const params = new URLSearchParams({
        client_id: 'non-existent-client-id',
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
      expect(json.error_description).toContain('Client with ID "non-existent-client-id" not found.');
    });

    it('should return 400 if client is inactive', async () => {
      await prisma.oAuthClient.update({
        where: { id: client.id },
        data: { isActive: false },
      });
      const params = new URLSearchParams({
        client_id: client.clientId, // client.clientId is the string identifier
        redirect_uri: defaultRedirectUri,
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
      expect(json.error_description).toContain(`Client "${client.clientId}" is inactive.`);
    });

    it('should return 400 if redirect_uri is not registered for the client', async () => {
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: 'https://unregistered.uri/danger',
        response_type: 'code',
        scope: defaultScope,
        code_challenge: defaultCodeChallenge,
        code_challenge_method: 'S256',
      });
      const req = mockNextRequest(params);
      const response = await GET(req);
      expect(response.status).toBe(400); // Does not redirect to invalid URI
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toBe('Invalid redirect_uri.');
    });
  });

  describe('Scope Validation Errors (Redirect with error)', () => {
    it('should redirect with error if requested scope is not allowed for client', async () => {
        const params = new URLSearchParams({
            client_id: client.clientId,
            redirect_uri: defaultRedirectUri,
            response_type: 'code',
            scope: 'openid super:admin_magic', // super:admin_magic is not in client.allowedScopes
            state: 'scope-test-state',
            code_challenge: defaultCodeChallenge,
            code_challenge_method: 'S256',
        });
        const req = mockNextRequest(params);
        const response = await GET(req);
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get('Location')!);
        expect(location.origin).toBe(new URL(defaultRedirectUri).origin);
        expect(location.pathname).toBe(new URL(defaultRedirectUri).pathname);
        expect(location.searchParams.get('error')).toBe('invalid_scope');
        expect(location.searchParams.get('error_description')).toContain('not allowed for this client');
        expect(location.searchParams.get('state')).toBe('scope-test-state');
    });
  });

  // TODO: More tests needed for:
  // - User not authenticated (redirect to login page)
  // - User authenticated, no consent (redirect to consent page)
  // - User authenticated, consent given (successful code issuance and redirect)
  // - Scope reduction based on user's own permissions (if applicable beyond client's allowed scopes)
  // - Nonce handling in success/error redirects (if OIDC flow)

  it.todo('should redirect to login if user is not authenticated via auth_center_session_token');
  it.todo('should redirect to consent page if user is authenticated but consent is required and not yet given');
  it.todo('should successfully issue an authorization code and redirect if user authenticated and consent exists/given');

});
