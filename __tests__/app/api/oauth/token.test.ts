// __tests__/app/api/oauth/token.test.ts
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/oauth/token/route'; // Adjust path as necessary
import { PrismaClient } from '@/lib/generated/prisma';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { addHours, addDays, addMinutes, subMinutes } from 'date-fns';

// Mock Prisma Client
jest.mock('@/lib/generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockDeep<PrismaClient>()),
}));

// Instantiate the mock Prisma client to be used in tests
const prismaMock = new PrismaClient() as unknown as DeepMockProxy<PrismaClient>;

// Mock jose
const mockJose = jest.requireActual('jose');
jest.mock('jose', () => ({
  ...mockJose,
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
  decodeJwt: jest.fn(),
}));


// Helper function to create a NextRequest for POST with x-www-form-urlencoded body
function createMockPostRequest(formData: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/oauth/token');
  const body = new URLSearchParams(formData).toString();
  return new NextRequest(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
}

describe('OAuth 2.0 Token Endpoint (/api/oauth/token)', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('Successful Token Issuance (Authorization Code Grant)', () => {
    it('should issue access and refresh tokens for a valid authorization code', async () => {
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';
      const redirectUri = 'http://localhost:3000/callback';
      const authCodeString = 'valid-auth-code';
      const userId = 'test-user-id';
      const scope = 'read:profile';

      const mockClient = {
        id: clientId,
        secret: clientSecret,
        redirectUris: redirectUri,
        name: 'Test Client',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);

      const mockAuthCode = {
        id: 'auth-code-db-id',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: userId,
        expiresAt: addMinutes(new Date(), 5), // Not expired
        scope: scope,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);
      prismaMock.authorizationCode.delete.mockResolvedValue(mockAuthCode); // Mock deletion

      prismaMock.accessToken.create.mockResolvedValue({
        id: 'access-token-id',
        token: expect.any(String),
        clientId: clientId,
        userId: userId,
        expiresAt: addHours(new Date(), 1),
        scope: scope,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.refreshToken.create.mockResolvedValue({
        id: 'refresh-token-id',
        token: expect.any(String),
        clientId: clientId,
        userId: userId,
        expiresAt: addDays(new Date(), 30),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.access_token).toEqual(expect.any(String));
      expect(json.token_type).toBe('Bearer');
      expect(json.expires_in).toEqual(expect.any(Number));
      expect(json.refresh_token).toEqual(expect.any(String));
      expect(json.scope).toBe(scope);

      expect(prismaMock.client.findUnique).toHaveBeenCalledWith({ where: { id: clientId } });
      expect(prismaMock.authorizationCode.findUnique).toHaveBeenCalledWith({ where: { code: authCodeString } });
      expect(prismaMock.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: mockAuthCode.id } });

      expect(prismaMock.accessToken.create).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          expiresAt: expect.any(Date),
          userId: userId,
          clientId: clientId,
          scope: scope,
        },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          expiresAt: expect.any(Date),
          userId: userId,
          clientId: clientId,
        },
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should return 400 for invalid grant_type', async () => {
      const request = createMockPostRequest({
        grant_type: 'password', // Invalid grant type for this test
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'any-client',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('unsupported_grant_type');
    });

    it('should return 400 if code is missing', async () => {
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        redirect_uri: 'any-uri',
        client_id: 'any-client',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('code');
    });

     it('should return 400 if redirect_uri is missing', async () => {
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        client_id: 'any-client',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('redirect_uri');
    });

    it('should return 400 if client_id is missing', async () => {
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('client_id');
    });

    it('should return 400 if client_secret is missing', async () => {
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'any-client',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('client_secret');
    });


    it('should return 401 for invalid client_id', async () => {
      prismaMock.client.findUnique.mockResolvedValue(null);
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'unknown-client',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
    });

    it('should return 401 for invalid client_secret', async () => {
      const mockClient = {
        id: 'test-client-id',
        secret: 'correct-secret',
        redirectUris: 'any-uri',
        name: 'Test Client',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'test-client-id',
        client_secret: 'wrong-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
    });

    it('should return 400 for invalid authorization code (not found)', async () => {
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';
      const mockClient = { id: clientId, secret: clientSecret, redirectUris: 'any-uri', name: 'Test Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);
      prismaMock.authorizationCode.findUnique.mockResolvedValue(null); // Code not found

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'invalid-code',
        redirect_uri: 'any-uri',
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Authorization code not found');
    });

    it('should return 400 for expired authorization code', async () => {
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';
      const redirectUri = 'http://localhost:3000/callback';
      const authCodeString = 'expired-auth-code';

      const mockClient = { id: clientId, secret: clientSecret, redirectUris: redirectUri, name: 'Test Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);

      const mockAuthCode = {
        id: 'auth-code-db-id',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: 'test-user',
        expiresAt: subMinutes(new Date(), 5), // Expired 5 minutes ago
        scope: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);
      prismaMock.authorizationCode.delete.mockResolvedValue(mockAuthCode);


      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Authorization code has expired');
      expect(prismaMock.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: mockAuthCode.id } }); // Ensure expired code is deleted
    });

    it('should return 400 if auth code clientId does not match request clientId', async () => {
      const requestClientId = 'request-client-id';
      const actualClientId = 'actual-client-id'; // Code was issued to this client
      const clientSecret = 'test-client-secret';
      const redirectUri = 'http://localhost:3000/callback';
      const authCodeString = 'mismatched-client-auth-code';

      const mockClient = { id: requestClientId, secret: clientSecret, redirectUris: redirectUri, name: 'Request Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient); // Client making request is valid

      const mockAuthCode = {
        id: 'auth-code-db-id',
        code: authCodeString,
        clientId: actualClientId, // But code belongs to another client
        redirectUri: redirectUri,
        userId: 'test-user',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: requestClientId,
        client_secret: clientSecret,
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('not issued to this client');
    });

    it('should return 400 if auth code redirectUri does not match request redirectUri', async () => {
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';
      const requestRedirectUri = 'http://localhost:3000/callback-request';
      const actualRedirectUri = 'http://localhost:3000/callback-actual'; // Code was issued with this URI
      const authCodeString = 'mismatched-uri-auth-code';

      const mockClient = { id: clientId, secret: clientSecret, redirectUris: requestRedirectUri, name: 'Test Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);

      const mockAuthCode = {
        id: 'auth-code-db-id',
        code: authCodeString,
        clientId: clientId,
        redirectUri: actualRedirectUri, // Code has different redirect URI
        userId: 'test-user',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: requestRedirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Invalid redirect_uri');
    });

    // This test is effectively the same as 'invalid authorization code (not found)'
    // because a used code would have been deleted.
    it('should return 400 for an authorization code that has already been used', async () => {
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';
      const mockClient = { id: clientId, secret: clientSecret, redirectUris: 'any-uri', name: 'Test Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);
      prismaMock.authorizationCode.findUnique.mockResolvedValue(null); // Code not found (simulating already used and deleted)

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'already-used-code',
        redirect_uri: 'any-uri',
        client_id: clientId,
        client_secret: clientSecret,
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
      expect(json.error_description).toContain('Authorization code not found');
    });

     it('should return 500 if Prisma throws an unexpected error during client fetch', async () => {
      prismaMock.client.findUnique.mockRejectedValue(new Error('Database connection error'));
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'any-client',
        client_secret: 'any-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('server_error');
    });

    it('should return 500 if Prisma throws an unexpected error during auth code fetch', async () => {
      const mockClient = { id: 'c-id', secret: 'c-secret', redirectUris: 'any-uri', name: 'Test Client', createdAt: new Date(), updatedAt: new Date() };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);
      prismaMock.authorizationCode.findUnique.mockRejectedValue(new Error('Database connection error'));
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_id: 'c-id',
        client_secret: 'c-secret',
      });
      const response = await POST(request);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('server_error');
    });

    it('should return 401 if client authentication is completely missing', async () => {
        const request = createMockPostRequest({
            grant_type: 'authorization_code',
            code: 'any-code',
            redirect_uri: 'any-uri',
            // No client_id, client_secret, or client_assertion
        });
        const response = await POST(request);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
        expect(json.error_description).toContain('Client authentication required');
    });
  });

  describe('PKCE Verification', () => {
    const clientId = 'pkce-client';
    const clientSecret = 'pkce-secret';
    const redirectUri = 'http://localhost:3000/pkce-callback';
    const codeVerifier = 'valid_code_verifier_string_long_enough_for_sha256_testing_123';
    // Pre-calculated S256 challenge for the codeVerifier above. 
    // In a real test, you might generate this dynamically or use a known pair.
    // For: "valid_code_verifier_string_long_enough_for_sha256_testing_123"
    // SHA256 -> hex: f8b1c5fa58212d8b59896013423579798c485929591759a6712911991865031a
    // base64url: _LHF_lghLYtZiWAYQjV5eYxIWSlZFXmmcSkRmRhliance
    const codeChallengeS256 = '_LHF_lghLYtZiWAYQjV5eYxIWSlZFXmmcSkRmRhliance';

    beforeEach(() => {
        // Mock client for these tests
        prismaMock.client.findUnique.mockImplementation(async ({ where }) => {
            if (where.id === clientId) {
                return {
                    id: clientId,
                    secret: clientSecret, // For basic auth fallback or if PKCE is optional
                    redirectUris: redirectUri,
                    name: 'PKCE Test Client',
                    jwksUri: null, // Assuming no private_key_jwt for these specific tests
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            }
            return null;
        });
    });

    test('should issue tokens if code_verifier is valid for S256 challenge', async () => {
      const authCodeString = 'pkce-auth-code-s256';
      const mockAuthCode = {
        id: 'pkce-db-id-s256',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: 'pkce-user',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'openid',
        codeChallenge: codeChallengeS256,
        codeChallengeMethod: 'S256',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);
      prismaMock.authorizationCode.delete.mockResolvedValue(mockAuthCode);
      // Mock token creation
      prismaMock.accessToken.create.mockResolvedValue({} as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);


      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId, // PKCE can be used by public or confidential clients
        client_secret: clientSecret, // Assuming confidential client for this test
        code_verifier: codeVerifier,
      });

      const response = await POST(request);
      // console.log(await response.json()); // For debugging if it fails once implemented
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.access_token).toBeTruthy();
    });

    test('should return 400 (invalid_grant) if code_verifier is invalid', async () => {
      const authCodeString = 'pkce-auth-code-invalid-verifier';
      const mockAuthCode = {
        id: 'pkce-db-id-invalid',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: 'pkce-user-2',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'openid',
        codeChallenge: codeChallengeS256,
        codeChallengeMethod: 'S256',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: 'invalid_code_verifier_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant'); // As per RFC 7636, PKCE failure is invalid_grant
      expect(json.error_description).toContain('Invalid code_verifier.'); // Message from route
    });

    test('should return 400 (invalid_grant) if code_verifier is missing but was required', async () => { // Error should be invalid_grant as per RFC7636 and current implementation
      const authCodeString = 'pkce-auth-code-missing-verifier';
      const mockAuthCode = {
        id: 'pkce-db-id-missing',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: 'pkce-user-3',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'openid',
        codeChallenge: codeChallengeS256,
        codeChallengeMethod: 'S256',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        // code_verifier is missing
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant'); 
      expect(json.error_description).toContain('Missing code_verifier for PKCE flow.'); // Message from route
    });

    test('should return 400 (invalid_request) if code_verifier is present but no challenge was stored', async () => {
      const authCodeString = 'no-pkce-auth-code-but-verifier-sent';
       const mockAuthCode = {
        id: 'no-pkce-db-id',
        code: authCodeString,
        clientId: clientId,
        redirectUri: redirectUri,
        userId: 'no-pkce-user',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'openid',
        codeChallenge: null, // No challenge stored
        codeChallengeMethod: null, // No challenge method stored
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);
      
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier, // Verifier sent unexpectedly
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('code_verifier provided but no PKCE challenge was initiated for this code.'); // Message from route
    });
  });

  describe('private_key_jwt Client Authentication', () => {
    const jwtClientId = 'jwt-client-id';
    const jwksUri = 'http://localhost/jwks.json';
    const tokenEndpoint = 'http://localhost/api/oauth/token'; // Expected audience

    beforeEach(() => {
      // Reset specific mocks for jose that are manipulated in these tests
      (mockJose.createRemoteJWKSet as jest.Mock).mockReset();
      (mockJose.jwtVerify as jest.Mock).mockReset();
      (mockJose.decodeJwt as jest.Mock).mockReset();


      prismaMock.client.findUnique.mockImplementation(async ({ where }) => {
        if (where.id === jwtClientId) {
          return {
            id: jwtClientId,
            secret: 'not-used-for-jwt-auth',
            redirectUris: 'http://localhost:3000/callback',
            name: 'JWT Test Client',
            jwksUri: jwksUri,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      });

      // Mock successful JWT decoding and verification by default
      (mockJose.decodeJwt as jest.Mock).mockImplementation((assertion) => {
        if (typeof assertion === 'string' && assertion.startsWith('valid-assertion')) {
          return { iss: jwtClientId, sub: jwtClientId, aud: tokenEndpoint, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 };
        }
        return { iss: 'unknown', sub: 'unknown' }; // Default for non-matching assertions
      });
      
      const mockKeySet = jest.fn(); // This function is what createRemoteJWKSet returns
      (mockJose.createRemoteJWKSet as jest.Mock).mockReturnValue(mockKeySet);
      
      (mockJose.jwtVerify as jest.Mock).mockImplementation(async (assertion, keySet, options) => {
        if (assertion.startsWith('valid-assertion') && keySet === mockKeySet && options?.issuer === jwtClientId && options.audience === tokenEndpoint) {
          return {
            payload: { iss: jwtClientId, sub: jwtClientId, aud: tokenEndpoint, jti: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 },
            protectedHeader: { alg: 'RS256' },
          };
        }
        throw new mockJose.errors.JOSEError('JWT verification failed');
      });
    });

    it('should issue tokens with valid private_key_jwt client assertion', async () => {
      const authCodeString = 'auth-code-for-jwt-client';
      const mockAuthCode = {
        id: 'jwt-auth-db-id',
        code: authCodeString,
        clientId: jwtClientId, // IMPORTANT: Must match the client ID from JWT
        redirectUri: 'http://localhost:3000/callback',
        userId: 'jwt-user',
        expiresAt: addMinutes(new Date(), 5),
        scope: 'api:read',
        codeChallenge: null,
        codeChallengeMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.findUnique.mockResolvedValue(mockAuthCode);
      prismaMock.authorizationCode.delete.mockResolvedValue(mockAuthCode);
      prismaMock.accessToken.create.mockResolvedValue({} as any);
      prismaMock.refreshToken.create.mockResolvedValue({} as any);

      const clientAssertion = `valid-assertion-${crypto.randomUUID()}`; // Ensure unique assertion for each test run if JTI check were active

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: authCodeString,
        redirect_uri: 'http://localhost:3000/callback',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion,
        // No client_id or client_secret in body for private_key_jwt
      });

      const response = await POST(request);
      const responseBody = await response.json();
      // console.log("private_key_jwt success response: ", responseBody);

      expect(response.status).toBe(200);
      expect(responseBody.access_token).toBeTruthy();
      expect(mockJose.decodeJwt).toHaveBeenCalledWith(clientAssertion);
      expect(mockJose.createRemoteJWKSet).toHaveBeenCalledWith(new URL(jwksUri));
      expect(mockJose.jwtVerify).toHaveBeenCalledWith(
        clientAssertion,
        expect.any(Function), // The mockKeySet function
        { issuer: jwtClientId, audience: tokenEndpoint, algorithms: expect.any(Array) }
      );
    });

    it('should return 401 if private_key_jwt has invalid signature (simulated by jwtVerify throwing specific error)', async () => {
        (mockJose.jwtVerify as jest.Mock).mockRejectedValue(new mockJose.errors.JWSSignatureVerificationFailed());
        
        const clientAssertion = `valid-assertion-bad-sig`;
        (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: jwtClientId, sub: jwtClientId });


        const request = createMockPostRequest({
            grant_type: 'authorization_code',
            code: 'any-code-for-jwt-sig-fail',
            redirect_uri: 'any-uri',
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            client_assertion: clientAssertion,
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
        expect(json.error_description).toContain('Invalid signature or no matching key found');
    });

    it('should return 401 if private_key_jwt is expired (simulated by jwtVerify throwing specific error)', async () => {
        (mockJose.jwtVerify as jest.Mock).mockRejectedValue(new mockJose.errors.JWTExpired('JWT has expired'));
        const clientAssertion = `valid-assertion-expired`;
        (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: jwtClientId, sub: jwtClientId });


        const request = createMockPostRequest({
            grant_type: 'authorization_code',
            code: 'any-code-for-jwt-exp-fail',
            redirect_uri: 'any-uri',
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            client_assertion: clientAssertion,
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
        expect(json.error_description).toContain('Client assertion has expired');
    });
    
    it('should return 401 if private_key_jwt has incorrect audience (simulated by jwtVerify throwing specific error)', async () => {
        (mockJose.jwtVerify as jest.Mock).mockRejectedValue(new mockJose.errors.JWTClaimValidationFailed('Invalid audience', 'aud', 'invalid_claim'));
        const clientAssertion = `valid-assertion-bad-aud`;
        (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: jwtClientId, sub: jwtClientId });

        const request = createMockPostRequest({
            grant_type: 'authorization_code',
            code: 'any-code-for-jwt-aud-fail',
            redirect_uri: 'any-uri',
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            client_assertion: clientAssertion,
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
        // This error message comes from the generic catch block in the route if not a specific JOSEError code for audience
        expect(json.error_description).toContain('Client assertion validation failed'); 
    });


    it('should return 401 if client is not found for private_key_jwt', async () => {
      (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: 'unknown-jwt-client-id', sub: 'unknown-jwt-client-id' });
      // prismaMock.client.findUnique will return null based on current setup for 'unknown-jwt-client-id'
      
      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: 'jwt-for-unknown-client',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
      expect(json.error_description).toContain('Client not found');
    });
    
    it('should return 401 if client has no jwksUri configured for private_key_jwt', async () => {
      prismaMock.client.findUnique.mockResolvedValueOnce({ // Override default mock for this test
          id: jwtClientId,
          secret: 'secret',
          redirectUris: 'uri',
          name: 'Client Without JWKS',
          jwksUri: null, // No jwksUri
          createdAt: new Date(),
          updatedAt: new Date(),
      });
      (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: jwtClientId, sub: jwtClientId });

      const request = createMockPostRequest({
        grant_type: 'authorization_code',
        code: 'any-code',
        redirect_uri: 'any-uri',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: 'jwt-for-client-no-jwks',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('invalid_client');
      expect(json.error_description).toContain('Client not configured for JWT assertion: Missing jwksUri');
    });

    it('should return 401 if iss and sub in JWT do not match', async () => {
        (mockJose.decodeJwt as jest.Mock).mockReturnValue({ iss: jwtClientId, sub: 'mismatched-sub' });

        const request = createMockPostRequest({
            grant_type: 'authorization_code',
            code: 'any-code',
            redirect_uri: 'any-uri',
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            client_assertion: 'jwt-iss-sub-mismatch',
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.error).toBe('invalid_client');
        expect(json.error_description).toContain('Invalid JWT: iss and sub claims are required and must match');
    });
  });
});
