// app/api/v2/oauth/authorize/route.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createOAuth2TestSetup, TestDataManager, TEST_USERS, TestClient } from '@/../__tests__/utils/test-helpers';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { JWTUtils, PKCEUtils, ScopeUtils } from '@/lib/auth/oauth2'; // Assuming JWTUtils is here for internal token
import { ClientType } from '@prisma/client';
import * as jose from 'jose';

// Mock environment variables from authorize route
const AUTH_CENTER_LOGIN_PAGE_URL = '/login'; // process.env.AUTH_CENTER_LOGIN_PAGE_URL
const CONSENT_API_URL = '/api/v2/oauth/consent'; // process.env.CONSENT_API_URL
const AUTH_CENTER_UI_AUDIENCE = 'urn:auth-center:ui'; // process.env.AUTH_CENTER_UI_AUDIENCE
const AUTH_CENTER_UI_CLIENT_ID = 'auth-center-admin-client'; // process.env.AUTH_CENTER_UI_CLIENT_ID

const { httpClient, dataManager, setup, cleanup } = createOAuth2TestSetup('authorize-endpoint');

describe('/api/v2/oauth/authorize Endpoint', () => {
  let testClient: TestClient;
  let testUser: any; // Prisma User type
  let pkceParams: { codeVerifier: string; codeChallenge: string; codeChallengeMethod: string };

  // Mock environment variables for JWT signing (consistent with lib/auth/oauth2.test.ts)
  const MOCK_PRIVATE_KEY_PEM_FOR_SESSION = process.env.JWT_PRIVATE_KEY_PEM!;
  const MOCK_PUBLIC_KEY_PEM_FOR_SESSION = process.env.JWT_PUBLIC_KEY_PEM!;
  const MOCK_ISSUER_FOR_SESSION = process.env.JWT_ISSUER!;
  const MOCK_ALGORITHM_FOR_SESSION = process.env.JWT_ALGORITHM!;
  const MOCK_KID_FOR_SESSION = process.env.JWT_KEY_ID!;

  beforeAll(async () => {
    await setup();
    testUser = await dataManager.createUser(TEST_USERS.REGULAR);
    testClient = await dataManager.createClient({
      clientId: 'auth-test-client',
      clientName: 'Authorize Test Client',
      clientType: ClientType.PUBLIC, // PKCE is mandatory for public
      redirectUris: ['https://client.example.com/callback', 'http://localhost:3001/callback'],
      allowedScopes: ['openid', 'profile', 'email', 'api:read'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      requirePkce: true,
    });

    // Ensure process.env has the necessary JWT variables for internal session token signing/verification
    // These should match what the /authorize endpoint's internal JWT verification expects
    process.env.JWKS_URI = `http://localhost/.well-known/jwks.json`; // Assuming a local JWKS for internal tokens too
    process.env.JWT_ISSUER = MOCK_ISSUER_FOR_SESSION;
    process.env.JWT_AUDIENCE = AUTH_CENTER_UI_AUDIENCE; // Important for internal token validation
    process.env.JWT_ALGORITHM = MOCK_ALGORITHM_FOR_SESSION;
    // JWT_PUBLIC_KEY_PEM should be available for JWKS used by jose.jwtVerify in authorize route
  });

  afterAll(async () => {
    await cleanup();
    // Restore any specific env vars if changed only for this suite
  });

  beforeEach(async () => {
    pkceParams = PKCEUtils.generatePKCE();
    await prisma.authorizationCode.deleteMany({ where: { clientId: testClient.id }});
    await prisma.consentGrant.deleteMany({where: {userId: testUser.id, clientId: testClient.id}});
  });

  async function createAuthCenterSessionToken(userId: string, exp = '1h'): Promise<string> {
    const privateKey = await jose.importPKCS8(MOCK_PRIVATE_KEY_PEM_FOR_SESSION, MOCK_ALGORITHM_FOR_SESSION);
    return await new jose.SignJWT({})
      .setProtectedHeader({ alg: MOCK_ALGORITHM_FOR_SESSION, kid: MOCK_KID_FOR_SESSION })
      .setSubject(userId)
      .setIssuer(MOCK_ISSUER_FOR_SESSION)
      .setAudience(AUTH_CENTER_UI_AUDIENCE) // Audience for the auth center's UI session
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  }

  it('should redirect to login if user is not authenticated via auth_center_session_token', async () => {
    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', testClient.clientId);
    authorizeUrl.searchParams.set('redirect_uri', testClient.redirectUris[0]);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid profile');
    authorizeUrl.searchParams.set('state', 'csrf-token-123');
    authorizeUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', pkceParams.codeChallengeMethod);

    const request = new NextRequest(authorizeUrl.toString());
    // No auth_center_session_token cookie

    const response = await GET(request);
    expect(response.status).toBe(302); // Redirect
    const location = response.headers.get('Location');
    expect(location).toContain(AUTH_CENTER_LOGIN_PAGE_URL);
    // The redirect_uri for the login page should be the original /authorize request URL
    const loginRedirect = new URL(location!);
    expect(loginRedirect.searchParams.get('redirect_uri')).toBe(authorizeUrl.href);
  });

  it('should proceed to consent or code generation if user is authenticated and client is valid', async () => {
    const sessionToken = await createAuthCenterSessionToken(testUser.id);

    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', testClient.clientId);
    authorizeUrl.searchParams.set('redirect_uri', testClient.redirectUris[0]);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid profile'); // Requesting subset of allowed
    authorizeUrl.searchParams.set('state', 'csrf-token-consent-check');
    authorizeUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', pkceParams.codeChallengeMethod);

    const request = new NextRequest(authorizeUrl.toString());
    request.cookies.set('auth_center_session_token', sessionToken);

    const response = await GET(request);
    expect(response.status).toBe(302);
    const location = response.headers.get('Location');

    // Since consent is not yet granted, it should redirect to the consent page
    expect(location).toContain(CONSENT_API_URL);
    const consentUrlParams = new URL(location!).searchParams;
    expect(consentUrlParams.get('client_id')).toBe(testClient.clientId);
    expect(consentUrlParams.get('scope')).toBe('openid profile');
  });

  it('should generate authorization code and redirect if user authenticated and consent granted', async () => {
    const sessionToken = await createAuthCenterSessionToken(testUser.id);
    const scopesToGrant = 'openid profile';

    // Simulate prior consent
    await prisma.consentGrant.create({
      data: {
        userId: testUser.id,
        clientId: testClient.id!, // TestClient has string id, prisma Client has cuid id. Need to ensure this matches.
                                  // DataManager createClient returns TestClient which should have the CUID id.
        scopes: scopesToGrant,
        issuedAt: new Date(),
      }
    });

    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', testClient.clientId);
    authorizeUrl.searchParams.set('redirect_uri', testClient.redirectUris[0]);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', scopesToGrant);
    authorizeUrl.searchParams.set('state', 'csrf-token-code-gen');
    authorizeUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', pkceParams.codeChallengeMethod);

    const request = new NextRequest(authorizeUrl.toString());
    request.cookies.set('auth_center_session_token', sessionToken);

    const response = await GET(request);
    expect(response.status).toBe(302); // Redirect to client's redirect_uri
    const location = new URL(response.headers.get('Location')!);

    expect(location.origin).toBe(new URL(testClient.redirectUris[0]).origin);
    expect(location.pathname).toBe(new URL(testClient.redirectUris[0]).pathname);
    expect(location.searchParams.get('code')).toBeDefined();
    expect(location.searchParams.get('state')).toBe('csrf-token-code-gen');

    // Verify code in DB
    const authCode = await prisma.authorizationCode.findFirst({ where: { code: location.searchParams.get('code')! } });
    expect(authCode).toBeDefined();
    expect(authCode?.userId).toBe(testUser.id);
    expect(authCode?.clientId).toBe(testClient.id); // Prisma ID
    expect(authCode?.scope).toBe(scopesToGrant);
    expect(authCode?.codeChallenge).toBe(pkceParams.codeChallenge);
  });

  it('should return error for invalid client_id', async () => {
    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', 'invalid-client-id');
    // ... other params
    const request = new NextRequest(authorizeUrl.toString());
    const response = await GET(request);
    // Expecting JSON error because redirect_uri for invalid client is unknown
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_client');
  });

  it('should return error for redirect_uri mismatch', async () => {
    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', testClient.clientId);
    authorizeUrl.searchParams.set('redirect_uri', 'https://wrong.client.com/callback');
    // ... other params
    const request = new NextRequest(authorizeUrl.toString());
    const response = await GET(request);
    // Expecting JSON error because redirect_uri is invalid
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('invalid_request');
    expect(body.error_description).toContain('Invalid redirect_uri');
  });

  it('should return error for invalid scope (not allowed for client)', async () => {
    const sessionToken = await createAuthCenterSessionToken(testUser.id);
    const authorizeUrl = new URL(`http://localhost/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', testClient.clientId);
    authorizeUrl.searchParams.set('redirect_uri', testClient.redirectUris[0]);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid api:forbidden'); // api:forbidden not in client's allowedScopes
    authorizeUrl.searchParams.set('state', 'csrf-token-scope-error');
    authorizeUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', pkceParams.codeChallengeMethod);

    const request = new NextRequest(authorizeUrl.toString());
    request.cookies.set('auth_center_session_token', sessionToken);

    const response = await GET(request);
    expect(response.status).toBe(302); // Redirect with error
    const location = new URL(response.headers.get('Location')!);
    expect(location.searchParams.get('error')).toBe('invalid_scope');
    expect(location.searchParams.get('error_description')).toContain('not allowed for this client');
  });

});
