// __tests__/api/v2/oauth/token.test.ts

import { POST } from '@/app/api/v2/oauth/token/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../../utils/test-helpers';
import { OAuthClient, User, AuthorizationCode } from '@prisma/client';
import { JWTUtils as OAuth2JWTUtils } from '@/lib/auth/oauth2'; // Using the one from oauth2.ts for now
import { storeAuthorizationCode } from '@/lib/auth/authorizationCodeFlow';
import crypto from 'crypto';

// Helper to create a mock NextRequest with FormData
function mockNextRequestWithFormData(formData: FormData, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost/api/v2/oauth/token';
  // Simulate how Next.js provides formData in a POST request
  const request = {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    formData: async () => formData, // Ensure this method exists and returns the FormData
    // Add other properties if your route handler uses them (e.g., cookies, ip)
  } as NextRequest;
  return request;
}

// Helper to create FormData from an object
function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  return formData;
}

describe('/api/v2/oauth/token POST', () => {
  let testDataCreator: TestDataManager;
  let client: OAuthClient;
  let user: User;
  let validAuthCode: AuthorizationCode;
  const defaultRedirectUri = 'https://client.example.com/callback';
  const codeVerifier = 'test_code_verifier_string_long_enough_for_s256_compliance';
  let codeChallenge: string;

  // Set up JWT environment variables for jwtUtils from oauth2.ts
  // These should match what jwtUtils expects.
  const TEST_RSA_PRIVATE_KEY_TOKEN = process.env.JWT_PRIVATE_KEY_PEM || `-----BEGIN RSA PRIVATE KEY-----
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
  const TEST_RSA_PUBLIC_KEY_TOKEN = process.env.JWT_PUBLIC_KEY_PEM || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0bOfsfVfMQ0Tfe1W1V6U
GPU+8k9lZrMz/f4AbBoA2PMSdIGCfGfEoDfcUtblf3NQPI+dsqxxaN52blTl5Vtm
MdpcpmdGfTvWO39me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGQIDAQAB
-----END PUBLIC KEY-----`;

  process.env.JWT_PRIVATE_KEY_PEM = TEST_RSA_PRIVATE_KEY_TOKEN;
  process.env.JWT_PUBLIC_KEY_PEM = TEST_RSA_PUBLIC_KEY_TOKEN;
  process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'test-issuer-token-endpoint';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'test-audience-token-endpoint';


  beforeAll(async () => {
    await setupTestDb();
    // It's important that JWTUtils from oauth2.ts can load its keys.
    // If it loads them on module initialization, setting env vars here might be too late
    // unless the module is re-imported or has a re-init mechanism.
    // The JWTUtils in lib/auth/oauth2.ts seems to read env vars on each call to getPrivateKey/getPublicKey.
  });

  beforeEach(async () => {
    testDataCreator = new TestDataManager('token_route_test_');
    const rawUser = await testDataCreator.createUser({ username: 'token_user' });
    const dbUser = await prisma.user.findUnique({ where: { username: rawUser.username }});
    if (!dbUser) throw new Error("Test user setup failed");
    user = dbUser;

    const rawClient = await testDataCreator.createClient({
      clientId: 'token-test-client',
      name: 'Token Test Client',
      redirectUris: [defaultRedirectUri],
      allowedScopes: ['openid', 'profile', 'email', 'api:read'],
      isPublic: false, // Confidential client for some tests
      clientSecret: 'supersecretclienttoken', // TestDataManager will hash this
    });
    const dbClient = await prisma.oAuthClient.findUnique({ where: { clientId: rawClient.clientId }});
    if (!dbClient) throw new Error("Test client setup failed");
    client = dbClient;

    // PKCE challenge
    codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store a valid authorization code
    validAuthCode = await storeAuthorizationCode(
      client.id, // CUID of client
      user.id,
      defaultRedirectUri,
      'openid profile',
      codeChallenge,
      'S256'
    );
  });

  afterEach(async () => {
    await testDataCreator.cleanup();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Grant Type: authorization_code', () => {
    it('should return tokens for a valid authorization_code grant', async () => {
      const formData = createFormData({
        grant_type: 'authorization_code',
        code: validAuthCode.code,
        redirect_uri: defaultRedirectUri,
        client_id: client.clientId, // String client ID
        code_verifier: codeVerifier,
      });

      // Confidential client needs to authenticate. Using Basic Auth header.
      const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
      const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

      const response = await POST(req);
      expect(response.status).toBe(200);
      const json = await response.json();

      expect(json.access_token).toBeDefined();
      expect(json.token_type).toBe('Bearer');
      expect(json.expires_in).toBe(client.accessTokenLifetime || 3600);
      expect(json.refresh_token).toBeDefined();
      expect(json.scope).toBe('openid profile');
      if (json.scope?.includes('openid')) {
        expect(json.id_token).toBeDefined(); // ID token should be present if openid scope
      }
    });

    it('should return 400 if code is missing', async () => {
      const formData = createFormData({
        grant_type: 'authorization_code',
        // code: missing
        redirect_uri: defaultRedirectUri,
        client_id: client.clientId,
        code_verifier: codeVerifier,
      });
      const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
      const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

      const response = await POST(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('code is required');
    });

    it('should return 400 if redirect_uri is missing or mismatched', async () => {
        const formData = createFormData({
            grant_type: 'authorization_code',
            code: validAuthCode.code,
            // redirect_uri: missing
            client_id: client.clientId,
            code_verifier: codeVerifier,
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const responseMissing = await POST(req);
        expect(responseMissing.status).toBe(400);
        const jsonMissing = await responseMissing.json();
        expect(jsonMissing.error).toBe('invalid_request');
        expect(jsonMissing.error_description).toContain('redirect_uri is required');

        const formDataMismatched = createFormData({
            grant_type: 'authorization_code',
            code: validAuthCode.code,
            redirect_uri: 'https://wrong.uri/callback',
            client_id: client.clientId,
            code_verifier: codeVerifier,
        });
        const reqMismatched = mockNextRequestWithFormData(formDataMismatched, { Authorization: `Basic ${basicAuth}` });
        const responseMismatched = await POST(reqMismatched);
        expect(responseMismatched.status).toBe(400); // validateAuthCode returns null, caught as INVALID_GRANT
        const jsonMismatched = await responseMismatched.json();
        expect(jsonMismatched.error).toBe('invalid_grant');
    });

    it('should return 400 if PKCE code_verifier is incorrect', async () => {
        const formData = createFormData({
            grant_type: 'authorization_code',
            code: validAuthCode.code,
            redirect_uri: defaultRedirectUri,
            client_id: client.clientId,
            code_verifier: 'invalid-verifier-pkce',
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_grant'); // PKCE failure results in invalid_grant
        expect(json.error_description).toContain('PKCE verification failed');
    });

    it('should return 401 if client authentication fails for confidential client', async () => {
        const formData = createFormData({
            grant_type: 'authorization_code',
            code: validAuthCode.code,
            redirect_uri: defaultRedirectUri,
            client_id: client.clientId,
            code_verifier: codeVerifier,
            // No client_secret in body and no/wrong Basic Auth header
        });
        const req = mockNextRequestWithFormData(formData); // No Auth header

        const response = await POST(req);
        expect(response.status).toBe(401); // Client auth failed
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
    });

  });

  describe('Grant Type: client_credentials', () => {
    it('should return token for valid client_credentials grant with Basic Auth', async () => {
        const formData = createFormData({
            grant_type: 'client_credentials',
            scope: 'api:read',
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.access_token).toBeDefined();
        expect(json.token_type).toBe('Bearer');
        expect(json.scope).toContain('api:read');
    });

    it('should return token for valid client_credentials grant with client_id/secret in body', async () => {
        const formData = createFormData({
            grant_type: 'client_credentials',
            client_id: client.clientId,
            client_secret: 'supersecretclienttoken',
            scope: 'api:read email',
        });
        // No Authorization header
        const req = mockNextRequestWithFormData(formData);

        const response = await POST(req);
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.access_token).toBeDefined();
        expect(json.scope).toContain('api:read');
        expect(json.scope).toContain('email');
    });


    it('should return 401 if client authentication fails (wrong secret)', async () => {
        const formData = createFormData({
            grant_type: 'client_credentials',
            scope: 'api:read',
        });
        const basicAuth = Buffer.from(`${client.clientId}:wrongsecret`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
    });

    it('should return 400 if requested scope is not allowed for the client', async () => {
        const formData = createFormData({
            grant_type: 'client_credentials',
            scope: 'api:read super_admin_scope', // super_admin_scope not in client.allowedScopes
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_scope');
    });

    it('should return 400 if public client attempts client_credentials grant', async () => {
        const publicClientRaw = await testDataCreator.createClient({ clientId: 'public_client_cred_test', isPublic: true });
        const publicClient = await prisma.oAuthClient.findUnique({where: {clientId: publicClientRaw.clientId}});
        if(!publicClient) throw new Error("Failed to create public client for test");

        const formData = createFormData({
            grant_type: 'client_credentials',
            client_id: publicClient.clientId, // Public client identifying itself
        });
        const req = mockNextRequestWithFormData(formData); // No secret for public client

        const response = await POST(req);
        expect(response.status).toBe(400); // Or 401 depending on how ClientAuthUtils handles it initially
        const json = await response.json();
        expect(json.error).toBe('unauthorized_client'); // This is the specific error from the route logic
    });

  });

  describe('Grant Type: refresh_token', () => {
    let validRefreshToken: string;

    beforeEach(async () => {
        // Create a refresh token for the user and client
        validRefreshToken = await OAuth2JWTUtils.createRefreshToken({
            client_id: client.clientId,
            user_id: user.id,
            scope: 'openid profile api:read',
        });
        await prisma.refreshToken.create({
            data: {
                tokenHash: OAuth2JWTUtils.getTokenHash(validRefreshToken),
                userId: user.id,
                clientId: client.id,
                scope: 'openid profile api:read',
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            }
        });
    });

    it('should return new tokens for a valid refresh_token grant', async () => {
        const formData = createFormData({
            grant_type: 'refresh_token',
            refresh_token: validRefreshToken,
            // client_id: client.clientId, // Optional for confidential client if using Basic Auth
            // client_secret: 'supersecretclienttoken', // Optional
            scope: 'openid api:read', // Requesting a subset of original scopes
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(200);
        const json = await response.json();

        expect(json.access_token).toBeDefined();
        expect(json.token_type).toBe('Bearer');
        expect(json.refresh_token).toBeDefined(); // New refresh token due to rotation
        expect(json.refresh_token).not.toBe(validRefreshToken);
        expect(json.scope).toBe('openid api:read');

        // Verify old refresh token is revoked
        const oldTokenRecord = await prisma.refreshToken.findFirst({ where: { tokenHash: OAuth2JWTUtils.getTokenHash(validRefreshToken) }});
        expect(oldTokenRecord?.isRevoked).toBe(true);
    });

    it('should return 400 if refresh_token is invalid or expired', async () => {
        const formData = createFormData({
            grant_type: 'refresh_token',
            refresh_token: 'invalid-refresh-token-value',
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_grant');
    });

    it('should return 400 if requested scope for refresh_token is broader than original', async () => {
        const formData = createFormData({
            grant_type: 'refresh_token',
            refresh_token: validRefreshToken,
            scope: 'openid profile api:read api:write', // api:write was not in original scope
        });
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_scope');
    });

    it('should return 401 if client authentication fails for refresh_token grant (confidential client)', async () => {
        const formData = createFormData({
            grant_type: 'refresh_token',
            refresh_token: validRefreshToken,
            // Missing client_id/client_secret in body and no/wrong Basic Auth
        });
        const req = mockNextRequestWithFormData(formData); // No auth header

        const response = await POST(req);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
    });
  });

  describe('General Error Handling', () => {
    it('should return 400 if grant_type is missing', async () => {
        const formData = createFormData({ client_id: 'any' }); // Missing grant_type
        const req = mockNextRequestWithFormData(formData);
        const response = await POST(req);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('invalid_request');
        expect(json.error_description).toContain('grant_type is required');
    });

    it('should return 400 if grant_type is unsupported', async () => {
        const formData = createFormData({ grant_type: 'urn:ietf:params:oauth:grant-type:saml2-bearer' });
        const req = mockNextRequestWithFormData(formData);
        // Client auth might be needed depending on how deep the check goes before unsupported_grant_type
        const basicAuth = Buffer.from(`${client.clientId}:${'supersecretclienttoken'}`).toString('base64');
        const reqWithAuth = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

        const response = await POST(reqWithAuth);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toBe('unsupported_grant_type');
    });
  });
});
