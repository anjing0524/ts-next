// __tests__/app/api/oauth/authorize.test.ts
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/oauth/authorize/route'; // Adjust path as necessary
import { PrismaClient } from '@/lib/generated/prisma';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import { addMinutes } from 'date-fns';

// Mock Prisma Client
jest.mock('@/lib/generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockDeep<PrismaClient>()),
}));

// Instantiate the mock Prisma client to be used in tests
const prismaMock = new PrismaClient() as unknown as DeepMockProxy<PrismaClient>;

// Helper function to create a NextRequest
function createMockRequest(queryParams: Record<string, string>, method: string = 'GET', body: any = null): NextRequest {
  const url = new URL('http://localhost/api/oauth/authorize');
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new NextRequest(url.toString(), { method, body });
}

describe('OAuth 2.0 Authorization Endpoint (/api/oauth/authorize)', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('Successful Authorization Code Grant', () => {
    it('should redirect with a code and state when request is valid', async () => {
      const mockClient = {
        id: 'test-client-id',
        secret: 'test-client-secret',
        redirectUris: 'http://localhost:3000/callback,http://localhost:3000/callback2',
        name: 'Test Client',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);

      const mockAuthCode = {
        id: 'new-auth-code-id',
        code: expect.any(String),
        expiresAt: expect.any(Date),
        redirectUri: 'http://localhost:3000/callback',
        clientId: 'test-client-id',
        userId: 'test-user-id', // As per current implementation
        scope: 'read:profile',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.authorizationCode.create.mockResolvedValue(mockAuthCode);

      const request = createMockRequest({
        client_id: 'test-client-id',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'read:profile',
        state: 'xyz123',
      });

      const response = await GET(request);

      expect(response.status).toBe(302); // Or 303, 307 depending on Next.js redirect behavior
      const redirectUrl = new URL(response.headers.get('Location')!);
      expect(redirectUrl.origin).toBe('http://localhost:3000');
      expect(redirectUrl.pathname).toBe('/callback');
      expect(redirectUrl.searchParams.get('code')).toBeTruthy();
      expect(redirectUrl.searchParams.get('state')).toBe('xyz123');

      expect(prismaMock.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-client-id' },
      });
      expect(prismaMock.authorizationCode.create).toHaveBeenCalledWith({
        data: {
          code: expect.any(String),
          expiresAt: expect.any(Date),
          redirectUri: 'http://localhost:3000/callback',
          clientId: 'test-client-id',
          userId: 'test-user-id',
          scope: 'read:profile',
        },
      });
      // Check if expiresAt is approximately 10 minutes from now
      const createdAuthCodeData = prismaMock.authorizationCode.create.mock.calls[0][0].data;
      const expectedExpiresAt = addMinutes(new Date(), 10);
      expect(Math.abs(new Date(createdAuthCodeData.expiresAt).getTime() - expectedExpiresAt.getTime())).toBeLessThan(5000); // Allow 5s difference
    });
  });

  describe('Error Scenarios', () => {
    it('should return 400 if response_type is missing', async () => {
      const request = createMockRequest({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('response_type');
    });

    it('should return 400 if response_type is not "code"', async () => {
      const request = createMockRequest({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'token',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('unsupported_response_type');
    });

    it('should return 400 if client_id is missing', async () => {
      const request = createMockRequest({
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('client_id');
    });

    it('should return 400 if client is not found', async () => {
      prismaMock.client.findUnique.mockResolvedValue(null);
      const request = createMockRequest({
        client_id: 'unknown-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('unauthorized_client');
    });

    it('should return 400 if redirect_uri is missing', async () => {
       const mockClient = {
        id: 'test-client-id',
        secret: 'test-client-secret',
        redirectUris: 'http://localhost:3000/callback',
        name: 'Test Client',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.client.findUnique.mockResolvedValue(mockClient); // Client needs to be found first
      const request = createMockRequest({
        client_id: 'test-client-id',
        response_type: 'code',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('redirect_uri');
    });

    it('should return 400 if redirect_uri does not match registered URIs', async () => {
      const mockClient = {
        id: 'test-client-id',
        secret: 'test-client-secret',
        redirectUris: 'http://registered.com/callback,http://another.com/cb',
        name: 'Test Client',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.client.findUnique.mockResolvedValue(mockClient);
      const request = createMockRequest({
        client_id: 'test-client-id',
        redirect_uri: 'http://unregistered.com/callback',
        response_type: 'code',
      });
      const response = await GET(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_request');
      expect(json.error_description).toContain('Invalid redirect_uri');
    });

    it('should return 500 if Prisma throws an unexpected error', async () => {
      prismaMock.client.findUnique.mockRejectedValue(new Error('Database connection error'));
      const request = createMockRequest({
        client_id: 'test-client-id',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
      });
      const response = await GET(request);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toBe('server_error');
    });
  });
});
