// __tests__/api/v2/oauth/introspect/route.test.ts

import { POST } from '@/app/api/v2/oauth/introspect/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ClientAuthUtils, JWTUtils } from '@/lib/auth/oauth2';
import * as jose from 'jose'; // For JWTPayload type if needed
import { ApiResponse } from '@/lib/types/api';
import { IntrospectResponseActive, IntrospectResponseInactive, IntrospectResponseActive as IntrospectResponseActiveZodSchema } from '@/app/api/v2/oauth/introspect/schemas';
import { OAuth2Error, OAuth2ErrorCode } from '@/lib/errors';
import { OAuthClient, User, ClientType as PrismaClientType, AccessToken, RefreshToken, TokenBlacklist } from '@prisma/client';

// Mock dependencies
jest.mock('@/lib/auth/oauth2', () => {
  const originalOAuth2 = jest.requireActual('@/lib/auth/oauth2');
  return {
    ...originalOAuth2,
    ClientAuthUtils: { authenticateClient: jest.fn() },
    JWTUtils: {
      ...originalOAuth2.JWTUtils,
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      getTokenHash: jest.fn((token) => `hashed_${token}`),
    },
  };
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: { findUnique: jest.fn() },
    accessToken: { findFirst: jest.fn() },
    refreshToken: { findFirst: jest.fn() },
    tokenBlacklist: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

function createMockIntrospectRequest(body: Record<string, string>, headers?: Record<string, string>): NextRequest {
  const urlSearchParams = new URLSearchParams();
  for (const key in body) { urlSearchParams.append(key, body[key]); }
  const defaultHeaders = { 'Content-Type': 'application/x-www-form-urlencoded', ...headers };
  return new NextRequest('http://localhost/api/v2/oauth/introspect', {
    method: 'POST', headers: defaultHeaders, body: urlSearchParams.toString(),
  });
}

describe('POST /api/v2/oauth/introspect', () => {
  const mockAuthClient: OAuthClient = {
    id: 'client-cuid-introspect', clientId: 'introspect-client-id', clientSecret: 'h', name: 'Introspect Client',
    clientType: PrismaClientType.CONFIDENTIAL, allowedScopes: '[]', redirectUris: '[]', isActive: true, isPublic: false,
    accessTokenLifetime: 3600, refreshTokenLifetime: 86400, jwksUri: null, clientUri: null, logoUri: null,
    tosUri: null, policyUri: null, clientSecretExpiresAt: null, contacts: null, defaultMaxAge: null,
    requireAuthTime: false, requirePkce: true, idTokenSignedResponseAlg: 'RS256', idTokenEncryptedResponseAlg: null,
    idTokenEncryptedResponseEnc: null, userinfoSignedResponseAlg: null, userinfoEncryptedResponseAlg: null,
    userinfoEncryptedResponseEnc: null, requestObjectSigningAlg: null, requestObjectEncryptionAlg: null,
    requestObjectEncryptionEnc: null, tokenEndpointAuthMethod: 'client_secret_basic', tokenEndpointAuthSigningAlg: null,
    defaultAcrValues: null, initiateLoginUri: null, authorizationSignedResponseAlg: null,
    authorizationEncryptedResponseAlg: null, authorizationEncryptedResponseEnc: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const tokenToInspect = 'test_token_value';
  const mockUser: User = {
    id: 'user-sub-id', username: 'introspect_user', email: 'introspect@example.com', isActive: true,
    passwordHash: '', emailVerified: true, firstName: 'Intro', lastName: 'Spect', displayName: 'Intro Spect',
    avatar: null, phone: null, organization: null, department: null, workLocation: null,
    mustChangePassword: false, lastLoginAt: null, lockedUntil: null, failedLoginAttempts: 0,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockAccessTokenPayload: jose.JWTPayload = {
    sub: mockUser.id, client_id: 'token-issuing-client-id', jti: 'at_jti', // client_id of the token, not necessarily introspecting client
    scope: 'openid profile', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: 'test-issuer', aud: 'test-audience'
  };
   const mockDbAccessToken: AccessToken & { user: User | null } = {
    id: 'db_at_id', tokenHash: JWTUtils.getTokenHash(tokenToInspect), userId: mockUser.id, clientId: 'token-issuing-client-cuid', // CUID of token-issuing-client-id
    scope: 'openid profile', expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), user: mockUser,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ClientAuthUtils.authenticateClient as jest.Mock).mockResolvedValue(mockAuthClient); // Introspecting client
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  it('should return 415 for unsupported media type', async () => {
    const req = createMockIntrospectRequest({ token: tokenToInspect }, { 'Content-Type': 'application/json' });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();
    expect(response.status).toBe(415);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
  });

  it('should return 401 if client authentication fails', async () => {
    (ClientAuthUtils.authenticateClient as jest.Mock).mockRejectedValue(new OAuth2Error("Client auth failed", OAuth2ErrorCode.InvalidClient, 401));
    const req = createMockIntrospectRequest({ token: tokenToInspect });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();
    expect(response.status).toBe(401);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidClient);
  });

  it('should return 400 for Zod validation failure (missing token)', async () => {
    const req = createMockIntrospectRequest({});
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();
    expect(response.status).toBe(400);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
  });

  describe('Active Access Token', () => {
    beforeEach(() => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: true, payload: mockAccessTokenPayload });
        (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockDbAccessToken);
    });

    it('should return active:true and token details for valid access token', async () => {
        const req = createMockIntrospectRequest({ token: tokenToInspect, token_type_hint: 'access_token' });
        const response = await POST(req);
        const body: ApiResponse<IntrospectResponseActive> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.active).toBe(true);
        expect(body.data?.client_id).toBe(mockAccessTokenPayload.client_id); // client_id from token
        expect(body.data?.sub).toBe(mockAccessTokenPayload.sub);
        expect(body.data?.username).toBe(mockUser.username);
        expect(body.data?.token_type).toBe('Bearer');
        expect(body.message).toBe("Token is active.");
    });
  });

  describe('Active Refresh Token', () => {
    const mockRefreshTokenPayloadFull: jose.JWTPayload = {
      ...mockAccessTokenPayload, jti: 'rt_jti', scope: 'offline_access'
    };
    const mockDbRefreshToken: RefreshToken & { user: User | null } = {
        id: 'db_rt_id', tokenHash: JWTUtils.getTokenHash(tokenToInspect), userId: mockUser.id, clientId: 'token-issuing-client-cuid',
        scope: 'offline_access', expiresAt: new Date(Date.now() + 86400000), isRevoked: false,
        createdAt: new Date(), updatedAt: new Date(), previousTokenId: null, user: mockUser,
    };
    beforeEach(() => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: false, error: 'Not an AT' });
        (JWTUtils.verifyRefreshToken as jest.Mock).mockResolvedValue({ valid: true, payload: mockRefreshTokenPayloadFull });
        (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(mockDbRefreshToken);
    });
    it('should return active:true and token details for valid refresh token (with hint)', async () => {
        const req = createMockIntrospectRequest({ token: tokenToInspect, token_type_hint: 'refresh_token' });
        const response = await POST(req);
        const body: ApiResponse<IntrospectResponseActive> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.active).toBe(true);
        expect(body.data?.token_type).toBe('refresh_token');
    });
  });

  describe('Inactive Token Scenarios', () => {
    it('should return active:false if token verification fails completely', async () => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: false, error: 'Verification failed' });
        (JWTUtils.verifyRefreshToken as jest.Mock).mockResolvedValue({ valid: false, error: 'Not an RT' });
        const req = createMockIntrospectRequest({ token: tokenToInspect });
        const response = await POST(req);
        const body: ApiResponse<IntrospectResponseInactive> = await response.json();
        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.active).toBe(false);
        expect(body.message).toBe("Token is not active.");
    });

    it('should return active:false and specific message if access token is blacklisted', async () => {
        (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: true, payload: mockAccessTokenPayload });
        (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue({ jti: mockAccessTokenPayload.jti! } as TokenBlacklist);
        const req = createMockIntrospectRequest({ token: tokenToInspect, token_type_hint: 'access_token' });
        const response = await POST(req);
        const body: ApiResponse<IntrospectResponseInactive> = await response.json();
        expect(response.status).toBe(200);
        expect(body.data?.active).toBe(false);
        expect(body.message).toBe("Token is blacklisted.");
    });
  });

  it('should return 500 if active response Zod parsing fails (server error)', async () => {
    (JWTUtils.verifyAccessToken as jest.Mock).mockResolvedValue({ valid: true, payload: mockAccessTokenPayload });
    (prisma.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockDbAccessToken);

    const originalSafeParse = IntrospectResponseActiveZodSchema.safeParse;
    // Ensure the module name matches the export from schemas.ts
    jest.spyOn(require('@/app/api/v2/oauth/introspect/schemas'), 'IntrospectResponseActive', 'get')
        .mockReturnValue({ safeParse: jest.fn().mockReturnValue({ success: false, error: { flatten: () => ({ fieldErrors: { active: ['Test schema failure!'] } }) } }) });


    const req = createMockIntrospectRequest({ token: tokenToInspect });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INTROSPECTION_SCHEMA_ERROR_ACTIVE');

    // Restore if necessary, or ensure mocks are cleared via jest.clearAllMocks()
    jest.spyOn(require('@/app/api/v2/oauth/introspect/schemas'), 'IntrospectResponseActive', 'get')
        .mockReturnValue({safeParse: originalSafeParse});
  });
});
