// __tests__/api/v2/oauth/revoke/route.test.ts

import { POST } from '@/app/api/v2/oauth/revoke/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ClientAuthUtils, JWTUtils, AuthorizationUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2';
import * as jose from 'jose';
import { ApiResponse } from '@/lib/types/api';
import { OAuth2Error, OAuth2ErrorCode } from '@/lib/errors';
import { OAuthClient, ClientType as PrismaClientType } from '@prisma/client';

// Mock dependencies
jest.mock('@/lib/auth/oauth2', () => {
  const originalOAuth2 = jest.requireActual('@/lib/auth/oauth2');
  return {
    ...originalOAuth2,
    ClientAuthUtils: { authenticateClient: jest.fn() },
    JWTUtils: {
      ...originalOAuth2.JWTUtils,
      getTokenHash: jest.fn((token) => `hashed_${token}`),
    },
    AuthorizationUtils: {
        ...originalOAuth2.AuthorizationUtils,
        logAuditEvent: jest.fn().mockResolvedValue(undefined),
    }
  };
});

jest.mock('jose', () => ({
  ...jest.requireActual('jose'),
  decodeJwt: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: { findUnique: jest.fn() },
    accessToken: { findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() }, // Added findMany, deleteMany for cascading
    refreshToken: { findFirst: jest.fn(), update: jest.fn() },
    tokenBlacklist: { upsert: jest.fn() },
    $transaction: jest.fn(async (callback) => callback(prisma)), // Mock $transaction
  },
}));

// Helper to create mock NextRequest
function createMockRevokeRequest(body: Record<string, string>, headers?: Record<string, string>): NextRequest {
  const urlSearchParams = new URLSearchParams();
  for (const key in body) {
    urlSearchParams.append(key, body[key]);
  }
  const defaultHeaders = { 'Content-Type': 'application/x-www-form-urlencoded', ...headers };
  return new NextRequest('http://localhost/api/v2/oauth/revoke', {
    method: 'POST',
    headers: defaultHeaders,
    body: urlSearchParams.toString(),
  });
}

describe('POST /api/v2/oauth/revoke', () => {
  const mockAuthenticatedClient: OAuthClient = {
    id: 'client-cuid-revoke',
    clientId: 'revoke-test-client',
    clientSecret: 'hashed_secret', name: 'Revoke Test Client', clientType: PrismaClientType.CONFIDENTIAL,
    allowedScopes: '[]', redirectUris: '[]', isActive: true, isPublic: false,
    accessTokenLifetime: 3600, refreshTokenLifetime: 86400,
    jwksUri: null, clientUri: null, logoUri: null, tosUri: null, policyUri: null,
    clientSecretExpiresAt: null, contacts: null, defaultMaxAge: null,
    requireAuthTime: false, requirePkce: true,
    idTokenSignedResponseAlg: 'RS256', idTokenEncryptedResponseAlg: null, idTokenEncryptedResponseEnc: null,
    userinfoSignedResponseAlg: null, userinfoEncryptedResponseAlg: null, userinfoEncryptedResponseEnc: null,
    requestObjectSigningAlg: null, requestObjectEncryptionAlg: null, requestObjectEncryptionEnc: null,
    tokenEndpointAuthMethod: 'client_secret_basic', tokenEndpointAuthSigningAlg: null,
    defaultAcrValues: null, initiateLoginUri: null,
    authorizationSignedResponseAlg: null, authorizationEncryptedResponseAlg: null, authorizationEncryptedResponseEnc: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  const mockAccessToken = { id: 'at_id_1', tokenHash: 'hashed_access_token_to_revoke', clientId: mockAuthenticatedClient.id, userId: 'user1', expiresAt: new Date(Date.now() + 3600000) };
  const mockRefreshToken = { id: 'rt_id_1', tokenHash: 'hashed_refresh_token_to_revoke', clientId: mockAuthenticatedClient.id, userId: 'user1', expiresAt: new Date(Date.now() + 86400000), isRevoked: false };


  beforeEach(() => {
    jest.clearAllMocks();
    (ClientAuthUtils.authenticateClient as jest.Mock).mockResolvedValue(mockAuthenticatedClient);
  });

  it('should return 200 OK and process access token revocation', async () => {
    (jose.decodeJwt as jest.Mock).mockReturnValue({ jti: 'access_jti' });
    (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockAccessToken);

    const req = createMockRevokeRequest({ token: 'access_token_to_revoke', token_type_hint: 'access_token' });
    const response = await POST(req);
    const body: ApiResponse<null> = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Token revocation request processed.');
    expect(prisma.tokenBlacklist.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jti: 'access_jti' },
      create: { jti: 'access_jti', tokenType: 'access_token', expiresAt: mockAccessToken.expiresAt },
    }));
    expect(AuthorizationUtils.logAuditEvent).toHaveBeenCalled();
  });

  it('should return 200 OK and process refresh token revocation (including cascading)', async () => {
    (jose.decodeJwt as jest.Mock).mockReturnValue({ jti: 'refresh_jti' });
    (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(mockRefreshToken);
    (prisma.accessToken.findMany as jest.Mock).mockResolvedValue([ // Simulate related access tokens
        { id: 'cascade_at_1', expiresAt: new Date(Date.now() + 10000) },
        { id: 'cascade_at_2', expiresAt: new Date(Date.now() + 20000) },
    ]);


    const req = createMockRevokeRequest({ token: 'refresh_token_to_revoke', token_type_hint: 'refresh_token' });
    const response = await POST(req);
    const body: ApiResponse<null> = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: mockRefreshToken.id },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    }));
    expect(prisma.tokenBlacklist.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jti: 'refresh_jti' },
    }));
    // Check if cascading blacklist upserts were called
    expect(prisma.tokenBlacklist.upsert).toHaveBeenCalledTimes(1 + 2); // 1 for RT, 2 for cascaded ATs
    expect(AuthorizationUtils.logAuditEvent).toHaveBeenCalled();
  });

  it('should return 200 OK if token is not found (no hint)', async () => {
    (jose.decodeJwt as jest.Mock).mockReturnValue({ jti: 'unknown_jti' });
    (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

    const req = createMockRevokeRequest({ token: 'unknown_token' });
    const response = await POST(req);
    const body: ApiResponse<null> = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.tokenBlacklist.upsert).not.toHaveBeenCalled(); // Nothing to blacklist if not found
    expect(AuthorizationUtils.logAuditEvent).toHaveBeenCalled();
  });

  it('should return 415 for unsupported media type', async () => {
    const req = createMockRevokeRequest({ token: 'anytoken' }, { 'Content-Type': 'application/json' });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(415);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest); // As mapped by the route
    expect(body.error?.message).toContain('Unsupported Media Type');
  });

  it('should return 401 if client authentication fails', async () => {
    (ClientAuthUtils.authenticateClient as jest.Mock).mockRejectedValue(
      new OAuth2Error('Client auth failed', OAuth2ErrorCode.InvalidClient, 401)
    );
    const req = createMockRevokeRequest({ token: 'anytoken' });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidClient);
  });

  it('should return 400 for Zod validation failure (missing token)', async () => {
    const req = createMockRevokeRequest({}); // token missing
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
    expect(body.error?.details?.issues[0].path).toContain('token');
  });

  it('should return 400 if client_id in body does not match authenticated client', async () => {
    const req = createMockRevokeRequest({ token: 'anytoken', client_id: 'rogue-client' });
    const response = await POST(req);
    const body: ApiResponse<never> = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
    expect(body.error?.message).toBe('client_id in body does not match authenticated client.');
  });

   it('should correctly use JTI from decoded JWT if available, otherwise token ID', async () => {
    // Case 1: JTI available
    (jose.decodeJwt as jest.Mock).mockReturnValue({ jti: 'jwt_actual_jti' });
    (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockAccessToken);
    let req = createMockRevokeRequest({ token: 'access_token_with_jti' });
    await POST(req);
    expect(prisma.tokenBlacklist.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { jti: 'jwt_actual_jti' },
        create: expect.objectContaining({ jti: 'jwt_actual_jti' })
    }));
    jest.clearAllMocks();
    (ClientAuthUtils.authenticateClient as jest.Mock).mockResolvedValue(mockAuthenticatedClient); // Re-mock after clear

    // Case 2: JTI not available from decode, fallback to token ID
    (jose.decodeJwt as jest.Mock).mockReturnValue(null); // No JTI from JWT
    (prisma.accessToken.findFirst as jest.Mock).mockResolvedValue(mockAccessToken); // mockAccessToken.id is 'at_id_1'
    req = createMockRevokeRequest({ token: 'access_token_no_jti_in_jwt' });
    await POST(req);
    expect(prisma.tokenBlacklist.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { jti: mockAccessToken.id }, // Fallback to token's own ID
        create: expect.objectContaining({ jti: mockAccessToken.id })
    }));
  });

});
