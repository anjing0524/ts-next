// __tests__/api/v2/oauth/introspect.test.ts

import { POST } from '@/app/api/v2/oauth/introspect/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../../utils/test-helpers';
import { OAuthClient, User, AccessToken, RefreshToken } from '@prisma/client';
import { JWTUtils as OAuth2JWTUtils } from '@/lib/auth/oauth2'; // Using the one from oauth2.ts
import * as jose from 'jose';

// Helpers (similar to token.test.ts)
function mockNextRequestWithFormData(formData: FormData, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost/api/v2/oauth/introspect';
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    formData: async () => formData,
    text: async () => new URLSearchParams(formData as any).toString(),
  } as NextRequest;
}

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  return formData;
}

describe('/api/v2/oauth/introspect POST', () => {
  let testDataCreator: TestDataManager;
  let resourceServerClient: OAuthClient; // The client making the introspection request
  let targetClient: OAuthClient; // The client to whom the token was issued
  let user: User;

  let validAccessTokenValue: string;
  let validRefreshTokenValue: string;
  let validAccessTokenJti: string;
  let validRefreshTokenJti: string;

  const rsClientSecret = 'rs-super-secret';

  // JWT Env Vars
  process.env.JWT_PRIVATE_KEY_PEM = process.env.JWT_PRIVATE_KEY_PEM || `-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDRs5+x9V8xDRN9
7VbVXpQY9T7yT2VmszP9/gBsGgDY8xJ0gYJ8Z8SgN9xS2uV/c1A8j52yrHFo3nZuV
OXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y
8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZCAwEAAQKBgQCOLc5+L5rN42gY
V7PqN9xS2uV/c1A8j52yrHFo3nZuVOXlW2Yx2k6aZ0Z9O9Y7f2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGB
APyZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8
Z/2Z7Y8ZAoGBAPZZ7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAO5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGAZ5Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/
Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8ZAoGARpZ7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7
Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z/2Z7Y8Z-----END RSA PRIVATE KEY-----`;
  process.env.JWT_PUBLIC_KEY_PEM = process.env.JWT_PUBLIC_KEY_PEM || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0bOfsfVfMQ0Tfe1W1V6U
GPU+8k9lZrMz/f4AbBoA2PMSdIGCfGfEoDfcUtblf3NQPI+dsqxxaN52blTl5Vtm
MdpcpmdGfTvWO39me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGQIDAQAB
-----END PUBLIC KEY-----`;
  process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'test-issuer-introspect';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'test-audience-introspect';


  beforeAll(async () => { await setupTestDb(); });

  beforeEach(async () => {
    testDataCreator = new TestDataManager('introspect_route_');
    const u = await testDataCreator.createUser({ username: 'introspect_user' });
    const userDb = await prisma.user.findUnique({where: {username: u.username}});
    if(!userDb) throw new Error("User setup failed");
    user = userDb;

    const rsc = await testDataCreator.createClient({
      clientId: 'rs-client', name: 'Resource Server Client', clientSecret: rsClientSecret, isPublic: false,
    });
    const rscDb = await prisma.oAuthClient.findUnique({where: {clientId: rsc.clientId}});
    if(!rscDb) throw new Error("RS Client setup failed");
    resourceServerClient = rscDb;

    const tc = await testDataCreator.createClient({ clientId: 'target-client', name: 'Target Client' });
    const tcDb = await prisma.oAuthClient.findUnique({where: {clientId: tc.clientId}});
    if(!tcDb) throw new Error("Target Client setup failed");
    targetClient = tcDb;

    // Create Access Token
    rawAccessTokenValue = await OAuth2JWTUtils.createAccessToken({ client_id: targetClient.clientId, user_id: user.id, scope: 'read write', permissions: ['articles:read', 'articles:edit'] });
    const atDecoded = jose.decodeJwt(rawAccessTokenValue);
    validAccessTokenJti = atDecoded.jti!;
    await prisma.accessToken.create({
      data: {
        tokenHash: OAuth2JWTUtils.getTokenHash(rawAccessTokenValue), userId: user.id, clientId: targetClient.id,
        scope: 'read write', expiresAt: new Date(atDecoded.exp! * 1000), jti: validAccessTokenJti,
        // isRevoked: false, // Assuming this field exists based on schema
      },
    });

    // Create Refresh Token
    rawRefreshTokenValue = await OAuth2JWTUtils.createRefreshToken({ client_id: targetClient.clientId, user_id: user.id, scope: 'read write' });
    const rtDecoded = jose.decodeJwt(rawRefreshTokenValue);
    validRefreshTokenJti = rtDecoded.jti!;
    await prisma.refreshToken.create({
      data: {
        tokenHash: OAuth2JWTUtils.getTokenHash(rawRefreshTokenValue), userId: user.id, clientId: targetClient.id,
        scope: 'read write', expiresAt: new Date(rtDecoded.exp! * 1000), jti: validRefreshTokenJti,
      },
    });
  });

  afterEach(async () => {
    await testDataCreator.cleanup();
    await prisma.accessToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.tokenBlacklist.deleteMany({});
  });

  afterAll(async () => { await teardownTestDb(); });

  const getBasicAuthHeader = (clientId: string, clientSecret: string) => ({
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
  });

  it('should return active:true and token details for a valid access_token', async () => {
    const formData = createFormData({ token: rawAccessTokenValue });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(true);
    expect(json.client_id).toBe(targetClient.clientId);
    expect(json.username).toBe(user.username);
    expect(json.scope).toContain('read');
    expect(json.scope).toContain('write');
    expect(json.token_type).toBe('Bearer');
    expect(json.permissions).toEqual(['articles:read', 'articles:edit']);
    expect(json.jti).toBe(validAccessTokenJti);
  });

  it('should return active:true and token details for a valid refresh_token', async () => {
    const formData = createFormData({ token: rawRefreshTokenValue, token_type_hint: 'refresh_token' });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(true);
    expect(json.client_id).toBe(targetClient.clientId);
    expect(json.username).toBe(user.username);
    expect(json.token_type).toBe('refresh_token');
    expect(json.jti).toBe(validRefreshTokenJti);
  });

  it('should return active:false for an invalid token', async () => {
    const formData = createFormData({ token: 'invalid-token-string' });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(false);
  });

  it('should return active:false for an expired access token', async () => {
    const expiredTokenValue = await OAuth2JWTUtils.createAccessToken({ client_id: targetClient.clientId, user_id: user.id, scope: 'read', exp: '0s' });
    // No need to store in DB as JWTUtils.verifyAccessToken will catch expiry first
    const formData = createFormData({ token: expiredTokenValue });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(false);
  });

  it('should return active:false if access token JTI is blacklisted', async () => {
    await prisma.tokenBlacklist.create({ data: { jti: validAccessTokenJti, tokenType: 'access_token', expiresAt: new Date(Date.now() + 3600000) } });
    const formData = createFormData({ token: rawAccessTokenValue });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(false);
  });

  it('should return active:false if refresh token is marked as revoked in DB', async () => {
    await prisma.refreshToken.update({ where: { jti: validRefreshTokenJti }, data: { isRevoked: true }});
    const formData = createFormData({ token: rawRefreshTokenValue, token_type_hint: 'refresh_token' });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.active).toBe(false);
  });

  it('should return 401 if resource server authentication fails', async () => {
    const formData = createFormData({ token: rawAccessTokenValue });
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, 'wrong-rs-secret'));
    const response = await POST(req);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('invalid_client');
  });

  it('should return 400 if token parameter is missing', async () => {
    const formData = createFormData({}); // Missing token
    const req = mockNextRequestWithFormData(formData, getBasicAuthHeader(resourceServerClient.clientId, rsClientSecret));
    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('invalid_request');
    expect(json.error_description).toContain('token is required');
  });
});
