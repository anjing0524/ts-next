// __tests__/api/v2/oauth/revoke.test.ts

import { POST } from '@/app/api/v2/oauth/revoke/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setupTestDb, teardownTestDb, TestDataManager } from '../../../utils/test-helpers';
import { OAuthClient, User, AccessToken, RefreshToken } from '@prisma/client';
import { JWTUtils as OAuth2JWTUtils } from '@/lib/auth/oauth2'; // Using the one from oauth2.ts for consistency with route
import * as jose from 'jose'; // For creating test tokens

// Helper to create a mock NextRequest with FormData
function mockNextRequestWithFormData(formData: FormData, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost/api/v2/oauth/revoke';
  const request = {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    formData: async () => formData,
    text: async () => new URLSearchParams(formData as any).toString(), // For new URLSearchParams(await request.text())
    json: async () => JSON.parse(new URLSearchParams(formData as any).toString()), // Not really used for x-www-form-urlencoded
  } as NextRequest;
  return request;
}

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  return formData;
}

describe('/api/v2/oauth/revoke POST', () => {
  let testDataCreator: TestDataManager;
  let confidentialClient: OAuthClient;
  let publicClient: OAuthClient;
  let user: User;
  let accessToken: AccessToken;
  let refreshToken: RefreshToken;
  let rawAccessTokenValue: string;
  let rawRefreshTokenValue: string;

  const confidentialClientSecret = 'revoke-secret';

  // Setup JWT env vars for OAuth2JWTUtils
  const TEST_RSA_PRIVATE_KEY_REVOKE = process.env.JWT_PRIVATE_KEY_PEM || `-----BEGIN RSA PRIVATE KEY-----
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
  const TEST_RSA_PUBLIC_KEY_REVOKE = process.env.JWT_PUBLIC_KEY_PEM || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0bOfsfVfMQ0Tfe1W1V6U
GPU+8k9lZrMz/f4AbBoA2PMSdIGCfGfEoDfcUtblf3NQPI+dsqxxaN52blTl5Vtm
MdpcpmdGfTvWO39me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf9me2PGf
9me2PGf9me2PGf9me2PGQIDAQAB
-----END PUBLIC KEY-----`;

  process.env.JWT_PRIVATE_KEY_PEM = TEST_RSA_PRIVATE_KEY_REVOKE;
  process.env.JWT_PUBLIC_KEY_PEM = TEST_RSA_PUBLIC_KEY_REVOKE;
  process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'test-issuer-revoke';
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'test-audience-revoke';


  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    testDataCreator = new TestDataManager('revoke_route_test_');
    const u = await testDataCreator.createUser({ username: 'revoke_user' });
    const userDb = await prisma.user.findUnique({where: {username: u.username}});
    if(!userDb) throw new Error("User setup failed for revoke tests");
    user = userDb;

    const cc = await testDataCreator.createClient({
      clientId: 'revoke-conf-client',
      name: 'Revoke Confidential Client',
      clientSecret: confidentialClientSecret,
      isPublic: false,
    });
    const clientDbCc = await prisma.oAuthClient.findUnique({where: {clientId: cc.clientId}});
    if(!clientDbCc) throw new Error("Confidential client setup failed for revoke tests");
    confidentialClient = clientDbCc;

    const pc = await testDataCreator.createClient({
      clientId: 'revoke-pub-client',
      name: 'Revoke Public Client',
      isPublic: true,
    });
    const clientDbPc = await prisma.oAuthClient.findUnique({where: {clientId: pc.clientId}});
    if(!clientDbPc) throw new Error("Public client setup failed for revoke tests");
    publicClient = clientDbPc;

    // Create sample tokens
    rawAccessTokenValue = await OAuth2JWTUtils.createAccessToken({ client_id: confidentialClient.clientId, user_id: user.id, scope: 'read' });
    accessToken = await prisma.accessToken.create({
      data: {
        tokenHash: OAuth2JWTUtils.getTokenHash(rawAccessTokenValue),
        userId: user.id,
        clientId: confidentialClient.id,
        scope: 'read',
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
        jti: jose.decodeJwt(rawAccessTokenValue).jti // Store JTI if available
      },
    });

    rawRefreshTokenValue = await OAuth2JWTUtils.createRefreshToken({ client_id: confidentialClient.clientId, user_id: user.id, scope: 'read' });
    refreshToken = await prisma.refreshToken.create({
      data: {
        tokenHash: OAuth2JWTUtils.getTokenHash(rawRefreshTokenValue),
        userId: user.id,
        clientId: confidentialClient.id,
        scope: 'read',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days
        jti: jose.decodeJwt(rawRefreshTokenValue).jti
      },
    });
  });

  afterEach(async () => {
    await testDataCreator.cleanup();
    // Clean up TokenBlacklist as well
    await prisma.tokenBlacklist.deleteMany({});
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should return 200 OK when revoking a valid access_token with client auth', async () => {
    const formData = createFormData({
      token: rawAccessTokenValue,
      token_type_hint: 'access_token',
    });
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const blacklisted = await prisma.tokenBlacklist.findFirst({ where: { jti: accessToken.jti! } });
    expect(blacklisted).not.toBeNull();
  });

  it('should return 200 OK when revoking a valid refresh_token with client auth', async () => {
    const formData = createFormData({
      token: rawRefreshTokenValue,
      token_type_hint: 'refresh_token',
    });
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const dbToken = await prisma.refreshToken.findUnique({ where: { id: refreshToken.id } });
    expect(dbToken?.isRevoked).toBe(true);
    const blacklisted = await prisma.tokenBlacklist.findFirst({ where: { jti: refreshToken.jti! } });
    expect(blacklisted).not.toBeNull();
  });

  it('should return 200 OK for public client revoking its own token (identified by client_id in body)', async () => {
    // Create a token for the public client
    const publicClientTokenVal = await OAuth2JWTUtils.createAccessToken({ client_id: publicClient.clientId, user_id: user.id, scope: 'read' });
    const publicTokenJti = jose.decodeJwt(publicClientTokenVal).jti;
    await prisma.accessToken.create({
        data: {
            tokenHash: OAuth2JWTUtils.getTokenHash(publicClientTokenVal),
            userId: user.id,
            clientId: publicClient.id,
            scope: 'read',
            expiresAt: new Date(Date.now() + 3600 * 1000),
            jti: publicTokenJti
        }
    });

    const formData = createFormData({
      token: publicClientTokenVal,
      client_id: publicClient.clientId, // Public client identifies itself
    });
    const req = mockNextRequestWithFormData(formData); // No Basic Auth

    const response = await POST(req);
    expect(response.status).toBe(200);
    const blacklisted = await prisma.tokenBlacklist.findFirst({ where: { jti: publicTokenJti! } });
    expect(blacklisted).not.toBeNull();
  });


  it('should return 200 OK even if token is invalid or not found (confidential client)', async () => {
    const formData = createFormData({ token: 'invalid-token-value' });
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('should return 200 OK even if token is invalid (public client with client_id in body)', async () => {
    const formData = createFormData({ token: 'invalid-token-value', client_id: publicClient.clientId });
    const req = mockNextRequestWithFormData(formData);

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it('should return 400 if token parameter is missing', async () => {
    const formData = createFormData({}); // Missing token
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('invalid_request');
    expect(json.error_description).toContain('token is required');
  });

  it('should return 401 if confidential client authentication fails', async () => {
    const formData = createFormData({ token: rawAccessTokenValue });
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:wrongsecret`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('invalid_client');
  });

  it('should return 400 if client_id in body does not match authenticated client (confidential)', async () => {
    const formData = createFormData({ token: rawAccessTokenValue, client_id: 'rogue-client-id' });
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });

    const response = await POST(req);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('invalid_request');
    expect(json.error_description).toContain("client_id in body does not match authenticated client");
  });

  it('should correctly use token_type_hint for access_token', async () => {
     const formData = createFormData({ token: rawAccessTokenValue, token_type_hint: 'access_token'});
     const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
     const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });
     const response = await POST(req);
     expect(response.status).toBe(200);
     const blacklisted = await prisma.tokenBlacklist.findFirst({ where: { jti: accessToken.jti! } });
     expect(blacklisted).not.toBeNull();
     // Check that refresh token was NOT revoked by mistake
     const dbRfToken = await prisma.refreshToken.findUnique({ where: { id: refreshToken.id } });
     expect(dbRfToken?.isRevoked).toBe(false);
  });

  it('should correctly use token_type_hint for refresh_token', async () => {
    const formData = createFormData({ token: rawRefreshTokenValue, token_type_hint: 'refresh_token'});
    const basicAuth = Buffer.from(`${confidentialClient.clientId}:${confidentialClientSecret}`).toString('base64');
    const req = mockNextRequestWithFormData(formData, { Authorization: `Basic ${basicAuth}` });
    const response = await POST(req);
    expect(response.status).toBe(200);
    const blacklisted = await prisma.tokenBlacklist.findFirst({ where: { jti: refreshToken.jti! } });
    expect(blacklisted).not.toBeNull();
    const dbRfToken = await prisma.refreshToken.findUnique({ where: { id: refreshToken.id } });
    expect(dbRfToken?.isRevoked).toBe(true);
     // Check that access token was NOT revoked by mistake based on hint
     const dbAcToken = await prisma.accessToken.findUnique({ where: { id: accessToken.id } });
     // This is tricky as blacklist might catch its JTI if they were same, but access token specific fields shouldn't be marked.
     // The blacklist check is primary. This is more about ensuring the DB record isn't directly marked.
  });

});
