// __tests__/api/v2/oauth/consent/route.test.ts

import { GET, POST } from '@/app/api/v2/oauth/consent/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuthenticatedRequest, AuthenticatedUser } from '@/lib/auth/types';
import { storeAuthorizationCode } from '@/lib/auth/authorizationCodeFlow';
import { ApiResponse } from '@/lib/types/api';
import { OAuth2ErrorCode } from '@/lib/errors';
import { OAuthClient as Client, User, Scope, ConsentGrant, AuthorizationCode, ClientType as PrismaClientType } from '@prisma/client';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    oAuthClient: { findUnique: jest.fn() },
    scope: { findMany: jest.fn() },
    consentGrant: { upsert: jest.fn() },
    // storeAuthorizationCode calls prisma.authorizationCode.create
    authorizationCode: { create: jest.fn() },
  },
}));

// Mock storeAuthorizationCode
jest.mock('@/lib/auth/authorizationCodeFlow', () => ({
  storeAuthorizationCode: jest.fn(),
}));

// Mock requirePermission HOF
const mockAuthedUser: AuthenticatedUser = {
  id: 'user-consent-test-id',
  permissions: ['auth-center:interact'],
  clientId: 'auth-center-ui-client'
};
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn((permission) => (handler) => async (req: AuthenticatedRequest, params?: any) => {
    req.user = mockAuthedUser;
    return handler(req, params);
  }),
}));

// Helper to create mock NextRequest / AuthenticatedRequest
function createMockConsentRequest(
  method: 'GET' | 'POST',
  queryParams?: Record<string, string>,
  body?: any,
  contentType: string = 'application/json'
): AuthenticatedRequest {
  const url = new URL('http://localhost/api/v2/oauth/consent');
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const headers = new Headers();
  if (method === 'POST' && body) {
    headers.set('Content-Type', contentType);
  }

  let reqBody: BodyInit | null = null;
  if (body) {
    if (contentType === 'application/json') {
      reqBody = JSON.stringify(body);
    } else if (contentType === 'application/x-www-form-urlencoded') {
      reqBody = new URLSearchParams(body).toString();
    }
  }

  const request = new NextRequest(url.toString(), { method, headers, body: reqBody });
  (request as any).user = mockAuthedUser;
  return request as AuthenticatedRequest;
}

describe('API /api/v2/oauth/consent', () => {
  // Define a more complete mock client
  const mockClientDb: Client = {
    id: 'client-db-id-consent',
    clientId: 'consent-client-string-id',
    clientName: 'Consent Test App',
    isActive: true,
    redirectUris: JSON.stringify(['http://localhost:3000/app/callback']),
    allowedScopes: JSON.stringify(['openid', 'profile', 'email', 'offline_access']),
    clientSecret: 'hashed_secret', // Added for completeness, though not directly used in consent logic itself
    clientType: PrismaClientType.CONFIDENTIAL,
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
  const mockUserDb: User = {
    id: mockAuthedUser.id, username: 'consent_user', email: 'consent@example.com', isActive: true,
    passwordHash: 'hash', emailVerified: true, firstName: 'Consent', lastName: 'User',
    displayName: 'Consent U.', avatar: null, phone: null, organization: null, department: null,
    workLocation: null, mustChangePassword: false, lastLoginAt: null, lockedUntil: null,
    failedLoginAttempts: 0, createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };
  const mockScopeRecords: Scope[] = [
    { id: 'scope_id_openid', name: 'openid', description: 'Sign in using your identity', isActive: true, isPublic: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'scope_id_profile', name: 'profile', description: 'View your profile information', isActive: true, isPublic: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'scope_id_email', name: 'email', description: 'Access your email address', isActive: true, isPublic: true, createdAt: new Date(), updatedAt: new Date() },
  ];

  const baseGetParams = {
    client_id: mockClientDb.clientId!,
    redirect_uri: JSON.parse(mockClientDb.redirectUris!)[0],
    scope: 'openid profile email',
    response_type: 'code',
    state: 'csrfState123',
    code_challenge: 'pkceChallengeStringIsValidLengthAndCharsForDemo',
    code_challenge_method: 'S256',
    nonce: 'oidcNonceValue'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserDb);
    (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClientDb);
    (prisma.scope.findMany as jest.Mock).mockImplementation(({ where }) =>
      Promise.resolve(mockScopeRecords.filter(s => where.name.in.includes(s.name)))
    );
  });

  describe('GET Handler (getConsentPageDataHandlerInternal)', () => {
    it('should return 200 with consent page data successfully', async () => {
      const req = createMockConsentRequest('GET', baseGetParams);
      const response = await GET(req);
      const body: ApiResponse<any> = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toBe("Consent data retrieved successfully.");
      expect(body.data?.client?.id).toBe(mockClientDb.clientId);
      expect(body.data?.requested_scopes).toHaveLength(3);
      expect(body.data?.user?.id).toBe(mockUserDb.id);
    });

    it('should return 400 if client_id is missing', async () => {
      const { client_id, ...params } = baseGetParams;
      const req = createMockConsentRequest('GET', params as any); // client_id removed
      const response = await GET(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
    });

    it('should return 403 if client not found', async () => {
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);
        const req = createMockConsentRequest('GET', baseGetParams);
        const response = await GET(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(403);
        expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidClient);
    });
  });

  describe('POST Handler (submitConsentDecisionHandlerInternal)', () => {
    const basePostForm = { ...baseGetParams, decision: 'allow' }; // Default to allow

    beforeEach(() => {
      (storeAuthorizationCode as jest.Mock).mockResolvedValue({ code: 'mocked_auth_code_consent' } as Partial<AuthorizationCode>);
      (prisma.consentGrant.upsert as jest.Mock).mockResolvedValue({} as ConsentGrant);
    });

    it('should redirect with code on "allow" decision (form-urlencoded)', async () => {
      const req = createMockConsentRequest('POST', undefined, basePostForm, 'application/x-www-form-urlencoded');
      const response = await POST(req);

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain(basePostForm.redirect_uri);
      expect(location).toContain('code=mocked_auth_code_consent');
    });

    it('should redirect with code on "allow" decision (json)', async () => {
      const req = createMockConsentRequest('POST', undefined, basePostForm, 'application/json');
      const response = await POST(req);
      expect(response.status).toBe(302);
    });

    it('should redirect with error on "deny" decision', async () => {
      const denyForm = { ...basePostForm, decision: 'deny' };
      const req = createMockConsentRequest('POST', undefined, denyForm, 'application/x-www-form-urlencoded');
      const response = await POST(req);
      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain(`error=${OAuth2ErrorCode.AccessDenied}`);
    });

    it('should return 415 for unsupported content type', async () => {
        const req = createMockConsentRequest('POST', undefined, basePostForm, 'text/plain');
        const response = await POST(req);
        const body: ApiResponse<never> = await response.json();
        expect(response.status).toBe(415);
        expect(body.error?.code).toBe('UNSUPPORTED_MEDIA_TYPE_CONSENT_POST');
    });

    it('should return 400 if decision is missing in POST body', async () => {
      const { decision, ...formWithoutDecision } = basePostForm;
      const req = createMockConsentRequest('POST', undefined, formWithoutDecision, 'application/json');
      const response = await POST(req);
      const body: ApiResponse<never> = await response.json();

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe(OAuth2ErrorCode.InvalidRequest);
    });
  });
});
