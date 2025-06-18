// __tests__/api/v2/oauth/token/route.test.ts

import { POST } from '@/app/api/v2/oauth/token/route';
import { NextRequest } from 'next/server';
import { ClientAuthUtils, JWTUtils, ScopeUtils, AuthorizationUtils } from '@/lib/auth/oauth2';
import { OAuth2Error, OAuth2ErrorCode, BaseError, TokenError, ResourceNotFoundError, ValidationError, AuthenticationError, ConfigurationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import * as authorizationCodeFlow from '@/lib/auth/authorizationCodeFlow';
import { TokenSuccessResponse } from '@/app/api/v2/oauth/token/schemas';
import { ApiResponse } from '@/lib/types/api';
import { OAuthClient, User, ClientType as PrismaClientType, Prisma } from '@prisma/client';

// Mock dependencies
jest.mock('@/lib/auth/oauth2', () => {
  const originalOAuth2 = jest.requireActual('@/lib/auth/oauth2');
  return {
    ...originalOAuth2,
    ClientAuthUtils: { // Mocking the entire class or specific static methods
      ...originalOAuth2.ClientAuthUtils,
      authenticateClient: jest.fn(),
    },
    JWTUtils: {
      ...originalOAuth2.JWTUtils,
      createAccessToken: jest.fn().mockResolvedValue('mocked_access_token'),
      createRefreshToken: jest.fn().mockResolvedValue('mocked_refresh_token'),
      createIdToken: jest.fn().mockResolvedValue('mocked_id_token'),
      getTokenHash: jest.fn((token) => `hashed_${token}`),
      verifyRefreshToken: jest.fn(), // Mocked for refresh token grant tests
    },
    // AuthorizationUtils.getUserPermissions is spied on per test if needed
  };
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    authorizationCode: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    accessToken: { create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    tokenBlacklist: { findUnique: jest.fn() }, // For JWTUtils verify if it checks blacklist
  },
}));

jest.mock('@/lib/auth/authorizationCodeFlow', () => ({
  ...jest.requireActual('@/lib/auth/authorizationCodeFlow'),
  validateAuthorizationCode: jest.fn(),
}));


function createMockTokenRequest(body: Record<string, string>, headers?: Record<string, string>): NextRequest {
  const urlSearchParams = new URLSearchParams();
  for (const key in body) {
    urlSearchParams.append(key, body[key]);
  }
  const defaultHeaders = { 'Content-Type': 'application/x-www-form-urlencoded', ...headers };

  return new NextRequest(`http://localhost/api/v2/oauth/token`, {
    method: 'POST',
    headers: defaultHeaders,
    body: urlSearchParams.toString(),
  });
}

describe('POST /api/v2/oauth/token', () => {
  // Define a more complete mock client that satisfies Prisma's OAuthClient type
  const mockConfidentialClient: OAuthClient = {
    id: 'client-cuid-confidential',
    clientId: 'test-confidential-client',
    clientSecret: 'hashed_secret_value',
    name: 'Test Confidential Client',
    clientType: PrismaClientType.CONFIDENTIAL,
    allowedScopes: JSON.stringify(['openid', 'profile', 'email', 'read:data', 'write:data']),
    redirectUris: JSON.stringify(['http://localhost:3000/callback']),
    isActive: true,
    isPublic: false,
    accessTokenLifetime: 3600,
    refreshTokenLifetime: 86400 * 30,
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

  const mockPublicClient: OAuthClient = {
    ...mockConfidentialClient,
    id: 'client-cuid-public',
    clientId: 'test-public-client',
    clientSecret: null,
    clientType: PrismaClientType.PUBLIC,
    isPublic: true,
    tokenEndpointAuthMethod: 'none',
  };

  const mockUser: User = {
    id: 'user-cuid', username: 'testuser', email: 'test@example.com', isActive: true,
    passwordHash: 'somehash', emailVerified: true, firstName: 'Test', lastName: 'User',
    displayName: 'Test User', avatar: null, phone: null, organization: null,
    department: null, workLocation: null, mustChangePassword: false,
    lastLoginAt: null, lockedUntil: null, failedLoginAttempts: 0,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default client auth to success with confidential client for most tests
    (ClientAuthUtils.authenticateClient as jest.Mock).mockResolvedValue(mockConfidentialClient);
    // Default user lookup
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    // Default permissions
    jest.spyOn(AuthorizationUtils, 'getUserPermissions').mockResolvedValue(['read:data', 'profile', 'openid', 'email']);

  });

  // Client Auth Failure tests (Good)
  describe('Client Authentication Failures', () => {
    it('should return 401 if ClientAuthUtils.authenticateClient throws OAuth2Error(INVALID_CLIENT)', async () => {
      (ClientAuthUtils.authenticateClient as jest.Mock).mockRejectedValue(
        new OAuth2Error( 'Client authentication failed test message.', OAuth2ErrorCode.InvalidClient, 401)
      );
      const req = createMockTokenRequest({ grant_type: 'client_credentials' });
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidClient);
    });
  });

  // Grant Type Handling tests (Good)
  describe('Grant Type Handling', () => {
    it('should return 400 if grant_type is missing', async () => {
      const req = createMockTokenRequest({});
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
      expect(body.error?.message).toBe('grant_type is required.');
    });
     it('should return 400 for unsupported grant_type', async () => {
      const req = createMockTokenRequest({ grant_type: 'unsupported_grant' });
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe(OAuth2ErrorCode.UnsupportedGrantType);
    });
  });

  // Authorization Code Grant tests (Good, minor adjustments for error details)
  describe('Authorization Code Grant', () => {
    const authCodeGrantRequestBase = {
        grant_type: 'authorization_code',
        code: 'valid_auth_code',
        redirect_uri: JSON.parse(mockConfidentialClient.redirectUris!)[0],
        code_verifier: 'pkce_verifier_string_example_long_enough',
        client_id: mockConfidentialClient.clientId,
    };
    const mockValidatedAuthCode = {
        id:'ac_id', code: 'valid_auth_code', userId: mockUser.id, clientId: mockConfidentialClient.id,
        scope: 'openid profile read:data', nonce: 'testnonce', redirectUri: authCodeGrantRequestBase.redirect_uri,
        expiresAt: new Date(Date.now() + 60000), isUsed: false, codeChallenge: 'challenge', codeChallengeMethod: 'S256',
        createdAt: new Date(), updatedAt: new Date()
    };


    it('should return 400 if authorization_code parameters are invalid (Zod)', async () => {
      const req = createMockTokenRequest({ grant_type: 'authorization_code', code: 'auth_code' /* missing other fields */ });
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();
      expect(response.status).toBe(400);
      expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
      expect(body.error?.details).toBeDefined();
    });

    it('should return 400 (INVALID_GRANT) if validateAuthorizationCode throws TokenError', async () => {
        (authorizationCodeFlow.validateAuthorizationCode as jest.Mock).mockRejectedValue(
            new TokenError('Test: Auth code already used', 400, 'AUTH_CODE_USED')
        );
        const req = createMockTokenRequest(authCodeGrantRequestBase);
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidGrant);
        expect(body.error?.message).toBe('Test: Auth code already used');
    });

    it('should return 200 on successful authorization_code grant', async () => {
        (authorizationCodeFlow.validateAuthorizationCode as jest.Mock).mockResolvedValue(mockValidatedAuthCode);
        const req = createMockTokenRequest(authCodeGrantRequestBase);
        const response = await POST(req);
        const body: ApiResponse<TokenSuccessResponse> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.access_token).toBe('mocked_access_token');
        expect(body.data?.refresh_token).toBe('mocked_refresh_token');
        expect(body.data?.id_token).toBe('mocked_id_token');
        expect(body.data?.scope).toBe(mockValidatedAuthCode.scope);
    });
  });

  describe('Refresh Token Grant', () => {
    const refreshTokenGrantRequestBase = {
        grant_type: 'refresh_token',
        refresh_token: 'valid_refresh_token_value',
        client_id: mockConfidentialClient.clientId, // Optional in Zod schema, but good to test with
    };
    const mockStoredRefreshToken : Prisma.RefreshTokenGetPayload<{include: {user:true}}> = {
        id: 'rt-cuid', tokenHash: 'hashed_valid_refresh_token_value', userId: mockUser.id,
        clientId: mockConfidentialClient.id, scope: 'openid profile read:data',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000), isRevoked: false,
        createdAt: new Date(), updatedAt: new Date(), previousTokenId: null,
        user: mockUser,
    };

    beforeEach(() => {
        (JWTUtils.verifyRefreshToken as jest.Mock).mockResolvedValue({
            valid: true,
            payload: { sub: mockUser.id, client_id: mockConfidentialClient.clientId, scope: mockStoredRefreshToken.scope, jti: 'rt_jti' }
        });
        (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(mockStoredRefreshToken);
    });

    it('should return 400 if refresh_token parameter is missing (Zod)', async () => {
        const req = createMockTokenRequest({ grant_type: 'refresh_token' });
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
        expect(body.error?.details).toHaveProperty('refresh_token');
    });

    it('should return 400 (INVALID_GRANT) if JWTUtils.verifyRefreshToken fails', async () => {
        (JWTUtils.verifyRefreshToken as jest.Mock).mockResolvedValue({ valid: false, error: 'JWT verification failed' });
        const req = createMockTokenRequest(refreshTokenGrantRequestBase);
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400); // Status from OAuth2Error
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidGrant);
        expect(body.error?.message).toBe('JWT verification failed');
    });

    it('should return 400 (INVALID_GRANT) if refresh token not found in DB', async () => {
        (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
        const req = createMockTokenRequest(refreshTokenGrantRequestBase);
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(400);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidGrant);
        expect(body.error?.message).toBe('Refresh token not found.');
    });

    it('should return 200 and new tokens on successful refresh_token grant', async () => {
        const req = createMockTokenRequest({ ...refreshTokenGrantRequestBase, scope: 'openid profile' }); // Requesting narrower scope
        const response = await POST(req);
        const body: ApiResponse<TokenSuccessResponse> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.access_token).toBe('mocked_access_token');
        expect(body.data?.refresh_token).toBe('mocked_refresh_token'); // New rotated
        expect(body.data?.id_token).toBe('mocked_id_token');
        expect(body.data?.scope).toBe('openid profile');
        expect(prisma.refreshToken.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isRevoked: true } }));
        expect(prisma.refreshToken.create).toHaveBeenCalled(); // New one created
        expect(prisma.accessToken.create).toHaveBeenCalled();
    });
  });

  describe('Client Credentials Grant', () => {
    const clientCredentialsGrantRequestBase = {
        grant_type: 'client_credentials',
        client_id: mockConfidentialClient.clientId, // Optional in Zod schema if basic auth
    };

    it('should return 400 (INVALID_REQUEST) if scope is requested but invalid/not allowed (ScopeUtils check)', async () => {
        const req = createMockTokenRequest({ ...clientCredentialsGrantRequestBase, scope: 'admin:all' });
        // Mock ScopeUtils.validateScopes to simulate failure
        const validateScopesSpy = jest.spyOn(ScopeUtils, 'validateScopes').mockImplementation(async () => ({
            valid: false,
            invalidScopes: ['admin:all'],
            error_description: 'Scope admin:all not allowed for this client.'
        }));

        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(400);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidScope);
        expect(body.error?.message).toContain('Scope admin:all not allowed');
        validateScopesSpy.mockRestore();
    });

    it('should return 401 (UNAUTHORIZED_CLIENT) if a public client attempts client_credentials', async () => {
        (ClientAuthUtils.authenticateClient as jest.Mock).mockResolvedValue(mockPublicClient);
        const req = createMockTokenRequest({ grant_type: 'client_credentials', client_id: mockPublicClient.clientId });
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();

        expect(response.status).toBe(401); // Mapped by withErrorHandling from OAuth2Error's status
        expect(body.error?.code).toBe(OAuth2ErrorCode.UnauthorizedClient);
    });

    it('should return 200 on successful client_credentials grant (default scopes)', async () => {
        const validateScopesSpy = jest.spyOn(ScopeUtils, 'validateScopes').mockImplementation(async () => ({
             valid: true, invalidScopes: []
        }));
        const req = createMockTokenRequest(clientCredentialsGrantRequestBase); // No scope requested
        const response = await POST(req);
        const body: ApiResponse<TokenSuccessResponse> = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data?.access_token).toBe('mocked_access_token');
        expect(body.data?.refresh_token).toBeUndefined();
        expect(body.data?.scope).toBe(JSON.parse(mockConfidentialClient.allowedScopes!).join(' ')); // Default scopes
        expect(JWTUtils.createAccessToken).toHaveBeenCalled();
        expect(prisma.accessToken.create).toHaveBeenCalled();
        validateScopesSpy.mockRestore();
    });
  });
});
