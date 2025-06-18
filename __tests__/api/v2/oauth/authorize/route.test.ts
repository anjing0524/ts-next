// __tests__/api/v2/oauth/authorize/route.test.ts

import { GET } from '@/app/api/v2/oauth/authorize/route';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as jose from 'jose';
import { storeAuthorizationCode } from '@/lib/auth/authorizationCodeFlow';
import { OAuth2ErrorCode } from '@/lib/errors';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    consentGrant: { findFirst: jest.fn() },
  },
}));

// Mock jose
jest.mock('jose', () => ({
  ...jest.requireActual('jose'), // Use actual for URL, errors etc.
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

// Mock storeAuthorizationCode
jest.mock('@/lib/auth/authorizationCodeFlow', () => ({
  storeAuthorizationCode: jest.fn(),
}));

// Helper to create mock NextRequest
function createMockAuthorizeRequest(searchParams: Record<string, string>, cookies?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/v2/oauth/authorize');
  Object.entries(searchParams).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = new Headers();
  if (cookies) {
    headers.set('Cookie', Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '));
  }

  return new NextRequest(url.toString(), { headers });
}

describe('GET /api/v2/oauth/authorize', () => {
  const defaultClient = {
    id: 'client-cuid',
    clientId: 'test-client-id',
    isActive: true,
    redirectUris: JSON.stringify(['http://localhost:3000/callback']),
    allowedScopes: JSON.stringify(['openid', 'profile', 'email']),
    authorizationCodeLifetime: 600,
  };
  const defaultUser = { id: 'user-cuid', isActive: true, email: 'user@example.com' };
  const defaultCodeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // Example S256 challenge

  const baseValidParams = {
    client_id: defaultClient.clientId,
    redirect_uri: JSON.parse(defaultClient.redirectUris)[0],
    response_type: 'code',
    scope: 'openid profile',
    state: 'xyz123',
    code_challenge: defaultCodeChallenge,
    code_challenge_method: 'S256',
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.AUTH_CENTER_LOGIN_PAGE_URL = '/test-login';
    process.env.CONSENT_API_URL = '/api/v2/oauth/consent';
    process.env.AUTH_CENTER_UI_AUDIENCE = 'urn:test-auth-center:ui';
    process.env.AUTH_CENTER_UI_CLIENT_ID = 'test-auth-center-client';
    process.env.JWKS_URI = 'http://localhost/test-jwks.json';
    process.env.JWT_ISSUER = 'http://localhost/test-issuer';

    (jose.createRemoteJWKSet as jest.Mock).mockReturnValue(jest.fn()); // Mock JWKS function
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Parameter Validation (Zod)', () => {
    it('should return 400 JSON error if client_id is missing', async () => {
      const { client_id, ...params } = baseValidParams;
      const req = createMockAuthorizeRequest(params as any);
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(OAuth2ErrorCode.InvalidRequest);
      expect(body.error.details.issues[0].path).toContain('client_id');
    });

    it('should return 400 JSON error for invalid response_type', async () => {
      const req = createMockAuthorizeRequest({ ...baseValidParams, response_type: 'token' });
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error.code).toBe(OAuth2ErrorCode.InvalidRequest); // Zod validation error
      expect(body.error.details.issues[0].path).toContain('response_type');
    });
  });

  describe('Client Validation', () => {
    it('should return 400 JSON error if client not found or inactive', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);
      const req = createMockAuthorizeRequest(baseValidParams);
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(OAuth2ErrorCode.InvalidClient);
    });

    it('should return 400 JSON error if redirect_uri is invalid', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(defaultClient);
      const req = createMockAuthorizeRequest({ ...baseValidParams, redirect_uri: 'http://invalid.com/callback' });
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(OAuth2ErrorCode.InvalidRequest);
      expect(body.error.message).toBe('Invalid redirect_uri.');
    });
  });

  describe('Scope Validation (Redirects with error)', () => {
     beforeEach(() => {
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(defaultClient);
     });

    it('should redirect with error if scope is missing and required', async () => {
      // Assuming schema makes scope required. If not, this might pass or fail differently.
      // The current schema makes scope required.
      const {scope, ...params} = baseValidParams;
      const req = createMockAuthorizeRequest(params as any);
      const response = await GET(req);
      // This is a Zod validation error, so it will be JSON
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(OAuth2ErrorCode.InvalidRequest);
      expect(body.error.details.issues[0].path).toContain('scope');
    });

    it('should redirect with error if scope is invalid or not allowed', async () => {
        (ScopeUtils.validateScopes as jest.Mock) = jest.fn().mockResolvedValue({
            valid: false,
            invalidScopes: ['unauthorized_scope'],
            error_description: 'Scope unauthorized_scope is not allowed.'
        });
        const req = createMockAuthorizeRequest({ ...baseValidParams, scope: 'openid unauthorized_scope' });
        const response = await GET(req); // This is a redirect
        expect(response.status).toBe(302);
        const redirectUrl = new URL(response.headers.get('Location')!);
        expect(redirectUrl.searchParams.get('error')).toBe(OAuth2ErrorCode.InvalidScope);
        expect(redirectUrl.searchParams.get('error_description')).toContain('unauthorized_scope');
    });
  });


  describe('User Authentication (Auth Center Session)', () => {
    beforeEach(() => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(defaultClient);
      (ScopeUtils.validateScopes as jest.Mock) = jest.fn().mockResolvedValue({ valid: true, invalidScopes: [] });
    });

    it('should redirect to login if no auth center session token', async () => {
      const req = createMockAuthorizeRequest(baseValidParams); // No cookies
      const response = await GET(req);
      expect(response.status).toBe(302);
      const redirectUrl = new URL(response.headers.get('Location')!);
      expect(redirectUrl.pathname).toBe('/test-login');
      expect(redirectUrl.searchParams.get('redirect_uri')).toContain('/api/v2/oauth/authorize');
    });

    it('should redirect to login if auth center session token is invalid/expired', async () => {
      (jose.jwtVerify as jest.Mock).mockRejectedValue(new Error('Token expired'));
      const req = createMockAuthorizeRequest(baseValidParams, { 'auth_center_session_token': 'invalid_token' });
      const response = await GET(req);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/test-login');
    });

    it('should return 500 JSON error if JWKS_URI for internal auth is not configured', async () => {
        process.env.JWKS_URI = ''; // Unset
        const req = createMockAuthorizeRequest(baseValidParams, { 'auth_center_session_token': 'some_token' });
        const response = await GET(req);
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error.code).toBe('CONFIG_JWKS_URI_MISSING');
    });
  });

  describe('Consent and Code Issuance', () => {
    beforeEach(() => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(defaultClient);
      (ScopeUtils.validateScopes as jest.Mock) = jest.fn().mockResolvedValue({ valid: true, invalidScopes: [] });
      (jose.jwtVerify as jest.Mock).mockResolvedValue({ payload: { sub: defaultUser.id } }); // Valid internal auth
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(defaultUser);
    });

    it('should redirect to consent page if no full consent exists', async () => {
      (prisma.consentGrant.findFirst as jest.Mock).mockResolvedValue(null); // No consent
      const req = createMockAuthorizeRequest(baseValidParams, { 'auth_center_session_token': 'valid_internal_token' });
      const response = await GET(req);
      expect(response.status).toBe(302);
      const redirectUrl = new URL(response.headers.get('Location')!);
      expect(redirectUrl.pathname).toBe('/api/v2/oauth/consent');
      expect(redirectUrl.searchParams.get('client_id')).toBe(defaultClient.clientId);
    });

    it('should issue code and redirect to client if full consent exists', async () => {
      (prisma.consentGrant.findFirst as jest.Mock).mockResolvedValue({ scopes: 'openid profile' }); // Full consent
      (storeAuthorizationCode as jest.Mock).mockResolvedValue({ code: 'mock_auth_code_value' });

      const req = createMockAuthorizeRequest(baseValidParams, { 'auth_center_session_token': 'valid_internal_token' });
      const response = await GET(req);
      expect(response.status).toBe(302);
      const redirectUrl = new URL(response.headers.get('Location')!);
      expect(redirectUrl.origin).toBe('http://localhost:3000'); // from redirect_uri
      expect(redirectUrl.pathname).toBe('/callback');
      expect(redirectUrl.searchParams.get('code')).toBe('mock_auth_code_value');
      expect(redirectUrl.searchParams.get('state')).toBe(baseValidParams.state);
      expect(storeAuthorizationCode).toHaveBeenCalled();
    });
  });
});
