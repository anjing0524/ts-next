// __tests__/api/v2/oauth/userinfo/route.test.ts

import { GET, POST } from '@/app/api/v2/oauth/userinfo/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JWTUtils, ScopeUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // JWTUtils is from the actual module
import { ApiResponse } from '@/lib/types/api';
import { UserInfoResponse } from '@/app/api/v2/oauth/userinfo/schemas';
import { OAuth2ErrorCode } from '@/lib/errors';

// Mock JWTUtils methods used by the handler
jest.mock('@/lib/auth/oauth2', () => {
  const originalOAuth2 = jest.requireActual('@/lib/auth/oauth2');
  return {
    ...originalOAuth2,
    JWTUtils: {
      ...originalOAuth2.JWTUtils,
      verifyAccessToken: jest.fn(),
      getTokenHash: jest.fn((token) => `hashed_${token}`), // Consistent hashing for tests
    },
    // ScopeUtils is used as is.
  };
});

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    tokenBlacklist: { findUnique: jest.fn() },
    accessToken: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() }, // Though userinfo uses user from accessToken include
  },
}));

// Helper to create mock NextRequest
function createMockUserInfoRequest(method: 'GET' | 'POST', token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new NextRequest('http://localhost/api/v2/oauth/userinfo', { method, headers });
}

describe('API /api/v2/oauth/userinfo', () => {
  const mockAccessToken = 'valid.access.token';
  const mockUserId = 'user-info-test-id';
  const mockJwtPayload = {
    sub: mockUserId,
    client_id: 'test-client',
    scope: 'openid profile email',
    jti: 'jwt-id-userinfo',
    exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
  };
  const mockUser = {
    id: mockUserId,
    username: 'infouser',
    email: 'info@example.com',
    firstName: 'Info',
    lastName: 'User',
    displayName: 'Info U. Ser',
    avatar: 'http://example.com/avatar.jpg',
    isActive: true,
    emailVerified: true,
    updatedAt: new Date(),
    // other necessary fields from User model
    passwordHash: 'secret', mustChangePassword: false, lastLoginAt: null, lockedUntil: null, failedLoginAttempts: 0,
    phone: null, organization: null, department: null, workLocation: null,
    createdAt: new Date(), createdBy: null, updatedBy: null,
  };
  const mockDbAccessToken = {
    tokenHash: `hashed_${mockAccessToken}`,
    userId: mockUserId,
    clientId: 'test-client-cuid', // Prisma Client ID
    scope: 'openid profile email',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    isRevoked: false, // Field not in model, assuming check relies on blacklist
    user: mockUser,
  };

  const testHandler = async (method: 'GET' | 'POST', req: NextRequest) => {
    if (method === 'GET') return GET(req);
    return POST(req); // Assuming POST uses the same internal handler
  };

  (['GET', 'POST'] as ('GET' | 'POST')[]).forEach(method => {
    describe(`using ${method} method`, () => {
      beforeEach(() => {
        jest.clearAllMocks();
        // Setup default successful mocks
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: true, payload: mockJwtPayload });
        (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockDbAccessToken);
      });

      it('should return 200 with user info for valid token and openid scope', async () => {
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<UserInfoResponse> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe("User information retrieved successfully.");
        expect(body.data?.sub).toBe(mockUserId);
        expect(body.data?.name).toBe(mockUser.displayName);
        expect(body.data?.email).toBe(mockUser.email);
        expect(body.data?.email_verified).toBe(mockUser.emailVerified);
        expect(body.data?.preferred_username).toBe(mockUser.username);
      });

      it('should return 401 if Authorization header is missing', async () => {
        const req = createMockUserInfoRequest(method, undefined); // No token
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
        expect(body.error?.message).toBe('Authorization header with Bearer token is required.');
      });

      it('should return 401 if token verification fails', async () => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: false, error: 'Token signature invalid' });
        const req = createMockUserInfoRequest(method, 'invalid.token');
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidToken);
        expect(body.error?.message).toBe('Token signature invalid');
      });

      it('should return 401 if token JTI is blacklisted', async () => {
        (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue({ jti: mockJwtPayload.jti });
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidToken);
        expect(body.error?.message).toBe('Access token has been revoked (JTI blacklisted).');
      });

      it('should return 401 if token not found in DB or expired/revoked in DB', async () => {
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(null);
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidToken);
        expect(body.error?.message).toBe('Access token is invalid or not found in database.');
      });

      it('should return 401 if token sub does not match user in DB', async () => {
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue({ ...mockDbAccessToken, userId: 'different-user-id' });
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidToken);
        expect(body.error?.message).toBe('Token subject mismatch with database record.');
      });

      it('should return 404 if user data not found for valid token sub', async () => {
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue({ ...mockDbAccessToken, user: null }); // User relation is null
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(404);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe('USER_DATA_NOT_FOUND_USERINFO');
      });

      it('should return 401 if user account is inactive', async () => {
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue({ ...mockDbAccessToken, user: { ...mockUser, isActive: false } });
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401); // AuthenticationError maps to 401
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe('ACCOUNT_INACTIVE_USERINFO');
      });


      it('should return 403 if "openid" scope is missing', async () => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({
          valid: true,
          payload: { ...mockJwtPayload, scope: 'profile email' } // openid scope missing
        });
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue({
            ...mockDbAccessToken,
            scope: 'profile email'
        });
        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(403);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InsufficientScope);
        expect(body.error?.message).toBe('The "openid" scope is required to access UserInfo.');
      });

      it('should return 500 if Zod parsing of final user info fails', async () => {
        // To simulate this, we can make UserInfoResponseSchema very restrictive or make user data incompatible
        // Easiest is to sabotage a required field like 'sub' after it's built
        const originalSchemaSafeParse = userInfoResponseSchema.safeParse;
        (userInfoResponseSchema as any).safeParse = jest.fn().mockReturnValue({ success: false, error: { flatten: () => ({ fieldErrors: { sub: ['Sub is now unexpectedly invalid!'] } }) } });

        const req = createMockUserInfoRequest(method, mockAccessToken);
        const response = await testHandler(method, req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(500);
        expect(body.success).toBe(false);
        expect(body.error?.code).toBe('USERINFO_RESPONSE_SCHEMA_ERROR');

        (userInfoResponseSchema as any).safeParse = originalSchemaSafeParse; // Restore
      });
    });
  });
});
