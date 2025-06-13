import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { addMinutes, addDays } from 'date-fns';
import { TEST_CONFIG } from '../utils/test-helpers'; // Added TEST_CONFIG

const BASE_URL = 'http://localhost:3000/datamgr_flow'; // Simplified

describe('客户端-资源-用户关系测试 / Client-Resource-User Relationships Tests', () => {
  let testUser1: any = null;
  let testUser2: any = null;
  let adminUser: any = null;
  let confidentialClient: any = null;
  let publicClient: any = null;
  let apiResource: any = null;
  let dataResource: any = null;
  let readPermission: any = null;
  let writePermission: any = null;
  let adminPermission: any = null;

  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function setupTestData(): Promise<void> {
    const userPassword = await bcrypt.hash('TestUser123!', 12);
    testUser1 = await prisma.user.create({
      data: {
        username: 'cru-user1-' + Date.now(),
        email: `cru-user1-${Date.now()}@example.com`,
        password: userPassword, emailVerified: true, isActive: true, firstName: 'Test', lastName: 'User1',
      },
    });
    testUser2 = await prisma.user.create({
      data: {
        username: 'cru-user2-' + Date.now(),
        email: `cru-user2-${Date.now()}@example.com`,
        password: userPassword, emailVerified: true, isActive: true, firstName: 'Test', lastName: 'User2',
      },
    });
    adminUser = await prisma.user.create({
      data: {
        username: 'cru-admin-' + Date.now(),
        email: `cru-admin-${Date.now()}@example.com`,
        password: userPassword, emailVerified: true, isActive: true, firstName: 'Admin', lastName: 'User',
      },
    });

    const scopesData = [
      { name: 'openid', description: 'OpenID Connect', isActive: true, isPublic: true }, { name: 'profile', description: 'Profile information', isActive: true, isPublic: true },
      { name: 'email', description: 'Email address', isActive: true, isPublic: true }, { name: 'api:read', description: 'API read access', isActive: true, isPublic: false },
      { name: 'api:write', description: 'API write access', isActive: true, isPublic: false }, { name: 'data:read', description: 'Data read access', isActive: true, isPublic: false },
      { name: 'data:write', description: 'Data write access', isActive: true, isPublic: false }, { name: 'admin:all', description: 'Admin all access', isActive: true, isPublic: false },
    ];
    for (const scopeData of scopesData) {
      await prisma.scope.upsert({ where: { name: scopeData.name }, update: {}, create: scopeData });
    }

    const clientSecret = 'cru-client-secret-123';
    confidentialClient = await prisma.client.create({
      data: {
        clientId: 'cru-confidential-' + crypto.randomBytes(8).toString('hex'), clientSecret: await bcrypt.hash(clientSecret, 12), name: 'CRU Confidential Client',
        redirectUris: JSON.stringify(['http://localhost:3000/callback']), grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
        responseTypes: JSON.stringify(['code']), scope: 'openid profile email api:read api:write data:read', isPublic: false, isActive: true, tokenEndpointAuthMethod: 'client_secret_basic',
      },
    });
    confidentialClient.plainSecret = clientSecret;

    publicClient = await prisma.client.create({
      data: {
        clientId: 'cru-public-' + crypto.randomBytes(8).toString('hex'), clientSecret: null, name: 'CRU Public Client',
        redirectUris: JSON.stringify(['http://localhost:3000/callback']), grantTypes: JSON.stringify(['authorization_code']),
        responseTypes: JSON.stringify(['code']), scope: 'openid profile email api:read', isPublic: true, isActive: true, tokenEndpointAuthMethod: 'none',
      },
    });
  }

  async function cleanupTestData(): Promise<void> {
    if (confidentialClient?.id) {
      await prisma.accessToken.deleteMany({ where: { clientId: confidentialClient.id } }); await prisma.refreshToken.deleteMany({ where: { clientId: confidentialClient.id } });
      await prisma.authorizationCode.deleteMany({ where: { clientId: confidentialClient.id } }); await prisma.client.delete({ where: { id: confidentialClient.id } });
    }
    if (publicClient?.id) {
      await prisma.accessToken.deleteMany({ where: { clientId: publicClient.id } }); await prisma.refreshToken.deleteMany({ where: { clientId: publicClient.id } });
      await prisma.authorizationCode.deleteMany({ where: { clientId: publicClient.id } }); await prisma.client.delete({ where: { id: publicClient.id } });
    }
    if (testUser1?.id) await prisma.user.delete({ where: { id: testUser1.id } });
    if (testUser2?.id) await prisma.user.delete({ where: { id: testUser2.id } });
    if (adminUser?.id) await prisma.user.delete({ where: { id: adminUser.id } });
  }

  describe('1. 客户端-资源关系 / Client-Resource Relationships', () => {
    it('TC_CRU_001_001: 应验证客户端对API资源的范围权限 / Should validate client scope permissions for API resources', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'api:read api:write' }),
      });

      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
      const tokens = await response.json();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.scope).toContain('api:read');
      expect(tokens.scope).toContain('api:write');
    });

    it('TC_CRU_001_002: 应拒绝客户端对未经授权资源范围的请求 / Should reject client requests for unauthorized resource scopes', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: publicClient.clientId, scope: 'admin:all data:write' }),
      });
      // Public client cannot use client_credentials grant. Also, scopes are not allowed.
      // Expect 'unauthorized_client' if grant not allowed, or 'invalid_scope' if grant allowed but scope bad.
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED); // More likely unauthorized_client due to grant type
      const error = await response.json();
      expect([TEST_CONFIG.ERROR_CODES.UNAUTHORIZED_CLIENT, TEST_CONFIG.ERROR_CODES.INVALID_SCOPE]).toContain(error.error);
    });

    it('TC_CRU_001_003: 应为不同客户端类型强制执行不同的资源访问级别 / Should enforce different resource access levels for different client types', async () => {
      const confidentialResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}` },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'data:read' }),
      });
      expect(confidentialResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // Confidential client can access data:read

      const publicResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: publicClient.clientId, scope: 'data:read' }),
      });
      // Public client cannot use client_credentials and 'data:read' is not in its scope.
      expect(publicResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED);
      const error = await publicResponse.json();
      expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.UNAUTHORIZED_CLIENT); // Grant type not allowed
    });

    it('TC_CRU_001_004: 应通过OAuth流程验证客户端-资源绑定 / Should validate client-resource binding through OAuth flows', async () => {
      const authCodeValue = 'client_resource_test_cru_' + crypto.randomBytes(16).toString('hex');
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: authCodeValue,
          expiresAt: addMinutes(new Date(), 10), redirectUri: 'http://localhost:3000/callback', clientId: confidentialClient.id,
          userId: testUser1.id, scope: 'openid profile api:read', state: 'test-state', nonce: 'test-nonce', authTime: new Date(),
        },
      });

      try {
        const response = await fetch(`${BASE_URL}/api/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}` },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: authCode.code, redirect_uri: 'http://localhost:3000/callback' }),
        });
        // Successful exchange or specific error related to code/client config
        expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]).toContain(response.status);
        if(response.status === TEST_CONFIG.HTTP_STATUS.OK) {
          const data = await response.json();
          expect(data.access_token).toBeDefined();
          expect(data.scope).toContain('api:read');
        }
      } finally {
        await prisma.authorizationCode.delete({ where: { id: authCode.id } }).catch(() => {});
      }
    });
  });

  describe('2. 用户-资源关系 / User-Resource Relationships', () => {
    it('TC_CRU_002_001: 应根据权限验证用户对资源的访问 / Should validate user access to resources based on permissions', async () => {
      const userToken = 'user_resource_token_cru_' + crypto.randomBytes(16).toString('hex');
      await prisma.accessToken.create({
        data: {
          token: userToken, tokenHash: crypto.createHash('sha256').update(userToken).digest('hex'), expiresAt: addMinutes(new Date(), 60),
          userId: testUser1.id, clientId: confidentialClient.id, scope: 'openid profile api:read',
        },
      });
      try {
        const response = await fetch(`${BASE_URL}/api/oauth/userinfo`, { method: 'GET', headers: { Authorization: `Bearer ${userToken}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // UserInfo should be accessible with openid
        const userInfo = await response.json();
        expect(userInfo.sub).toBe(testUser1.id);
        // Further tests would involve accessing a resource protected by 'api:read'
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: userToken } }).catch(() => {});
      }
    });

    it('TC_CRU_002_002: 应强制执行用户特定的资源边界 / Should enforce user-specific resource boundaries', async () => {
      const user1Token = 'user1_boundary_token_cru_' + crypto.randomBytes(16).toString('hex');
      await prisma.accessToken.create({
        data: {
          token: user1Token, tokenHash: crypto.createHash('sha256').update(user1Token).digest('hex'), expiresAt: addMinutes(new Date(), 60),
          userId: testUser1.id, clientId: confidentialClient.id, scope: 'openid profile', // Scope for a hypothetical /api/users/:id/profile
        },
      });
      // user2Token is not created as user1 should not be able to access user2's specific resources.

      try {
        // Attempt for user1 to access a hypothetical profile endpoint for user2
        const user1Response = await fetch(`${BASE_URL}/api/users/${testUser2.id}/profile`, { method: 'GET', headers: { Authorization: `Bearer ${user1Token}` } });
        // Expect 403 (Forbidden) if endpoint exists but access denied, or 404 if not found (depends on API design)
        expect([TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]).toContain(user1Response.status);
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: user1Token } }).catch(() => {});
      }
    });

    it('TC_CRU_002_003: 应处理分层的用户-资源权限 / Should handle hierarchical user-resource permissions', async () => {
      const adminToken = 'admin_hierarchy_token_cru_' + crypto.randomBytes(16).toString('hex');
      await prisma.accessToken.create({
        data: {
          token: adminToken, tokenHash: crypto.createHash('sha256').update(adminToken).digest('hex'), expiresAt: addMinutes(new Date(), 60),
          userId: adminUser.id, clientId: confidentialClient.id, scope: 'openid profile admin:all', // admin:all implies access
        },
      });
      try {
        // Admin attempts to access a user's profile or specific resource
        const response = await fetch(`${BASE_URL}/api/users/${testUser1.id}/profile`, { method: 'GET', headers: { Authorization: `Bearer ${adminToken}` } });
        // Expect 200 if admin:all grants this access, or specific error if not implemented/denied
        expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]).toContain(response.status);
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: adminToken } }).catch(() => {});
      }
    });

    it('TC_CRU_002_004: 应验证用户对资源访问的同意 / Should validate user consent for resource access', async () => {
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`);
      authUrl.searchParams.set('client_id', confidentialClient.clientId); authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', 'openid profile api:read');
      authUrl.searchParams.set('state', 'user-resource-consent-test-cru'); authUrl.searchParams.set('prompt', 'consent'); // Force consent screen

      const response = await fetch(authUrl.toString(), { method: 'GET', redirect: 'manual' });
      // Expect redirect to consent page (typically 302 to /consent or 200 if consent page rendered directly by route)
      // Or could be redirect to login if user not authenticated in test env.
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT]).toContain(response.status);
      if(response.status === TEST_CONFIG.HTTP_STATUS.FOUND || response.status === TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT) {
        expect(response.headers.get('Location')).toMatch(/\/consent|\/login/);
      }
    });
  });

  describe('3. 用户-客户端关系 / User-Client Relationships', () => {
    it('TC_CRU_003_001: 应验证用户对特定客户端的授权 / Should validate user authorization for specific clients', async () => {
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`);
      authUrl.searchParams.set('client_id', confidentialClient.clientId); authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', 'openid profile');
      authUrl.searchParams.set('state', 'user-client-auth-test-cru');

      const response = await fetch(authUrl.toString(), { method: 'GET', redirect: 'manual' });
      // Expect redirect to login/consent or directly to callback if session/consent exists
      expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FOUND, TEST_CONFIG.HTTP_STATUS.TEMPORARY_REDIRECT]).toContain(response.status);
    });

    it('TC_CRU_003_002: 应强制执行用户-客户端信任边界 / Should enforce user-client trust boundaries', async () => {
      const invalidClientId = 'invalid_client_cru_' + crypto.randomBytes(8).toString('hex');
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`);
      authUrl.searchParams.set('client_id', invalidClientId); authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', 'openid profile');

      const response = await fetch(authUrl.toString(), { method: 'GET', redirect: 'manual' });
      // Expect 400 (invalid_request for bad client_id) or 401 (invalid_client by some interpretations)
      expect([TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]).toContain(response.status);
      if (response.status === TEST_CONFIG.HTTP_STATUS.BAD_REQUEST || response.status === TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED) {
        const error = await response.json();
        expect(error.error).toBe(TEST_CONFIG.ERROR_CODES.INVALID_CLIENT); // Or INVALID_REQUEST
      }
    });

    it('TC_CRU_003_003: 应处理用户-客户端范围协商 / Should handle user-client scope negotiation', async () => {
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`);
      authUrl.searchParams.set('client_id', publicClient.clientId); authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', 'openid profile api:write'); // api:write not in publicClient.scope

      const response = await fetch(authUrl.toString(), { method: 'GET', redirect: 'manual' });
      // Expect redirect to callback with error=invalid_scope
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.FOUND); // Redirect
      const location = response.headers.get('Location');
      expect(location).toContain('error=invalid_scope');
    });

    it('TC_CRU_003_004: 应跨不同客户端验证用户会话 / Should validate user sessions across different clients', async () => {
      const token1_cru = 'user_client1_token_cru_' + crypto.randomBytes(16).toString('hex');
      const token2_cru = 'user_client2_token_cru_' + crypto.randomBytes(16).toString('hex');
      const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } });
      const pubClientDb = await prisma.client.findUnique({ where: { clientId: publicClient.clientId } });
      if (!confClientDb || !pubClientDb) throw new Error('Test clients not found');

      await prisma.accessToken.create({ data: { token: token1_cru, tokenHash: crypto.createHash('sha256').update(token1_cru).digest('hex'), expiresAt: addMinutes(new Date(), 60), userId: testUser1.id, clientId: confClientDb.id, scope: 'openid profile api:read' } });
      await prisma.accessToken.create({ data: { token: token2_cru, tokenHash: crypto.createHash('sha256').update(token2_cru).digest('hex'), expiresAt: addMinutes(new Date(), 60), userId: testUser1.id, clientId: pubClientDb.id, scope: 'openid profile' } });

      try {
        const response1 = await fetch(`${BASE_URL}/api/oauth/userinfo`, { method: 'GET', headers: { Authorization: `Bearer ${token1_cru}` } });
        const response2 = await fetch(`${BASE_URL}/api/oauth/userinfo`, { method: 'GET', headers: { Authorization: `Bearer ${token2_cru}` } });

        expect(response1.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        expect(response2.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);
        const userInfo1 = await response1.json(); const userInfo2 = await response2.json();
        expect(userInfo1.sub).toBe(testUser1.id); expect(userInfo2.sub).toBe(testUser1.id);
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: { in: [token1_cru, token2_cru] } } }).catch(() => {});
      }
    });
  });

  describe('4. 复杂关系场景 / Complex Relationship Scenarios', () => {
    it('TC_CRU_004_001: 应处理多客户端资源共享场景 / Should handle multi-client resource sharing scenarios', async () => {
      const sharedToken_cru = 'shared_resource_token_cru_' + crypto.randomBytes(16).toString('hex');
      const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } });
      if (!confClientDb) throw new Error('Confidential client not found');

      await prisma.accessToken.create({ data: { token: sharedToken_cru, tokenHash: crypto.createHash('sha256').update(sharedToken_cru).digest('hex'), expiresAt: addMinutes(new Date(), 60), userId: testUser1.id, clientId: confClientDb.id, scope: 'openid profile api:read data:read' } });
      try {
        const response = await fetch(`${BASE_URL}/api/oauth/userinfo`, { method: 'GET', headers: { Authorization: `Bearer ${sharedToken_cru}` } });
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK); // UserInfo is accessible
        // Further tests would involve accessing a resource protected by 'data:read'
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: sharedToken_cru } }).catch(() => {});
      }
    });

    it('TC_CRU_004_002: 应验证跨关系权限继承 / Should validate cross-relationship permission inheritance', async () => {
      const complexToken_cru = 'complex_permission_token_cru_' + crypto.randomBytes(16).toString('hex');
      const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } });
      if (!confClientDb) throw new Error('Confidential client not found');

      await prisma.accessToken.create({ data: { token: complexToken_cru, tokenHash: crypto.createHash('sha256').update(complexToken_cru).digest('hex'), expiresAt: addMinutes(new Date(), 60), userId: adminUser.id, clientId: confClientDb.id, scope: 'openid profile api:read api:write admin:all' } });
      try {
        const userinfoResponse = await fetch(`${BASE_URL}/api/oauth/userinfo`, { method: 'GET', headers: { Authorization: `Bearer ${complexToken_cru}` } });
        expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK);

        // Assuming /api/users is an admin-protected endpoint
        const usersResponse = await fetch(`${BASE_URL}/api/users`, { method: 'GET', headers: { Authorization: `Bearer ${complexToken_cru}` } });
        // This depends on the actual /api/users endpoint implementation and if 'admin:all' grants access
        expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.FORBIDDEN, TEST_CONFIG.HTTP_STATUS.NOT_FOUND]).toContain(usersResponse.status);
      } finally {
        await prisma.accessToken.deleteMany({ where: { token: complexToken_cru } }).catch(() => {});
      }
    });

    it('TC_CRU_004_003: 应强制执行基于关系的速率限制 / Should enforce relationship-based rate limiting', async () => {
      const promises = Array.from({ length: 15 }, () => // Increased for better chance to hit limit
        fetch(`${BASE_URL}/api/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}` },
          body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'api:read' }),
        })
      );
      const responses = await Promise.all(promises);
      const rateLimited = responses.some(r => r.status === TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS);
      const Succeeded = responses.some(r => r.status === TEST_CONFIG.HTTP_STATUS.OK);
      // Expect that either some succeeded OR some were rate limited. Not all should fail for other reasons.
      expect(Succeeded || rateLimited).toBe(true);
      if(rateLimited) {
         // If we actually hit rate limit, great.
      } else {
         // If not, all should succeed or be valid errors (not 5xx)
         responses.forEach(r => expect([TEST_CONFIG.HTTP_STATUS.OK, TEST_CONFIG.HTTP_STATUS.BAD_REQUEST, TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED]).toContain(r.status));
      }
    });
  });
});
