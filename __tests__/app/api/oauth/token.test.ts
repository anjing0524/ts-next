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
  });
});
