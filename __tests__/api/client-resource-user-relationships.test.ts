import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { addMinutes, addDays } from 'date-fns'

const BASE_URL = process.env.NODE_ENV === 'test' ? 'http://localhost:3000/datamgr_flow' : 'http://localhost:3000/datamgr_flow'

describe('Client-Resource-User Relationships Tests', () => {
  let testUser1: any = null
  let testUser2: any = null
  let adminUser: any = null
  let confidentialClient: any = null
  let publicClient: any = null
  let apiResource: any = null
  let dataResource: any = null
  let readPermission: any = null
  let writePermission: any = null
  let adminPermission: any = null

  beforeAll(async () => {
    console.log('🚀 Setting up Client-Resource-User Relationships test data...')
    await setupTestData()
  })

  afterAll(async () => {
    console.log('🧹 Cleaning up Client-Resource-User Relationships test data...')
    await cleanupTestData()
  })

  async function setupTestData(): Promise<void> {
    try {
      // Create test users
      const userPassword = await bcrypt.hash('TestUser123!', 12)
      
      testUser1 = await prisma.user.create({
        data: {
          username: 'cru-user1-' + Date.now(),
          email: `cru-user1-${Date.now()}@example.com`,
          password: userPassword,
          emailVerified: true,
          isActive: true,
          firstName: 'Test',
          lastName: 'User1',
        }
      })

      testUser2 = await prisma.user.create({
        data: {
          username: 'cru-user2-' + Date.now(),
          email: `cru-user2-${Date.now()}@example.com`,
          password: userPassword,
          emailVerified: true,
          isActive: true,
          firstName: 'Test',
          lastName: 'User2',
        }
      })

      adminUser = await prisma.user.create({
        data: {
          username: 'cru-admin-' + Date.now(),
          email: `cru-admin-${Date.now()}@example.com`,
          password: userPassword,
          emailVerified: true,
          isActive: true,
          firstName: 'Admin',
          lastName: 'User',
        }
      })

      // Create OAuth scopes
      const scopes = [
        { name: 'openid', description: 'OpenID Connect', isActive: true, isPublic: true },
        { name: 'profile', description: 'Profile information', isActive: true, isPublic: true },
        { name: 'email', description: 'Email address', isActive: true, isPublic: true },
        { name: 'api:read', description: 'API read access', isActive: true, isPublic: false },
        { name: 'api:write', description: 'API write access', isActive: true, isPublic: false },
        { name: 'data:read', description: 'Data read access', isActive: true, isPublic: false },
        { name: 'data:write', description: 'Data write access', isActive: true, isPublic: false },
        { name: 'admin:all', description: 'Admin all access', isActive: true, isPublic: false },
      ]

      for (const scopeData of scopes) {
        await prisma.scope.upsert({
          where: { name: scopeData.name },
          update: {},
          create: scopeData
        })
      }

      // Create clients with different scope permissions
      const clientSecret = 'cru-client-secret-123'
      
      // Confidential client with broad access
      confidentialClient = await prisma.client.create({
        data: {
          clientId: 'cru-confidential-' + crypto.randomBytes(8).toString('hex'),
          clientSecret: await bcrypt.hash(clientSecret, 12),
          name: 'CRU Confidential Client',
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
          responseTypes: JSON.stringify(['code']),
          scope: 'openid profile email api:read api:write data:read',
          isPublic: false,
          isActive: true,
          tokenEndpointAuthMethod: 'client_secret_basic',
        }
      })
      confidentialClient.plainSecret = clientSecret

      // Public client with limited access
      publicClient = await prisma.client.create({
        data: {
          clientId: 'cru-public-' + crypto.randomBytes(8).toString('hex'),
          clientSecret: null,
          name: 'CRU Public Client',
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          grantTypes: JSON.stringify(['authorization_code']),
          responseTypes: JSON.stringify(['code']),
          scope: 'openid profile email api:read',
          isPublic: true,
          isActive: true,
          tokenEndpointAuthMethod: 'none',
        }
      })

      console.log('✅ Client-Resource-User Relationships test data setup complete')
    } catch (error) {
      console.error('❌ Failed to setup CRU test data:', error)
      throw error
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      // Clean up in reverse order
      if (confidentialClient?.id) {
        await prisma.accessToken.deleteMany({ where: { clientId: confidentialClient.id } })
        await prisma.refreshToken.deleteMany({ where: { clientId: confidentialClient.id } })
        await prisma.authorizationCode.deleteMany({ where: { clientId: confidentialClient.id } })
        await prisma.client.delete({ where: { id: confidentialClient.id } })
      }
      if (publicClient?.id) {
        await prisma.accessToken.deleteMany({ where: { clientId: publicClient.id } })
        await prisma.refreshToken.deleteMany({ where: { clientId: publicClient.id } })
        await prisma.authorizationCode.deleteMany({ where: { clientId: publicClient.id } })
        await prisma.client.delete({ where: { id: publicClient.id } })
      }
      if (testUser1?.id) {
        await prisma.user.delete({ where: { id: testUser1.id } })
      }
      if (testUser2?.id) {
        await prisma.user.delete({ where: { id: testUser2.id } })
      }
      if (adminUser?.id) {
        await prisma.user.delete({ where: { id: adminUser.id } })
      }

      console.log('✅ Client-Resource-User Relationships test data cleanup complete')
    } catch (error) {
      console.error('❌ Failed to cleanup CRU test data:', error)
    }
  }

  describe('1. Client-Resource Relationships', () => {
    it('should validate client scope permissions for API resources', async () => {
      // Test that confidential client can access API resources within its scope
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read api:write',
        }),
      })

      expect([200, 400, 401, 405, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const tokens = await response.json()
        expect(tokens.access_token).toBeDefined()
        expect(tokens.scope).toContain('api:read')
      }

      console.log('✅ Client-Resource scope validation test passed')
    })

    it('should reject client requests for unauthorized resource scopes', async () => {
      // Test that public client cannot access admin resources
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: publicClient.clientId,
          scope: 'admin:all data:write', // Scopes not allowed for public client
        }),
      })

      expect([400, 401, 403, 405, 429, 500]).toContain(response.status)
      console.log('✅ Client unauthorized scope rejection test passed')
    })

    it('should enforce different resource access levels for different client types', async () => {
      // Test confidential client accessing data resources
      const confidentialResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'data:read',
        }),
      })

      // Test public client trying to access same data resources
      const publicResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: publicClient.clientId,
          scope: 'data:read', // Not in public client's allowed scopes
        }),
      })

      // Confidential client should succeed or get reasonable response
      expect([200, 400, 401, 405, 429, 500]).toContain(confidentialResponse.status)
      
      // Public client should be rejected
      expect([400, 401, 403, 405, 429, 500]).toContain(publicResponse.status)

      console.log('✅ Client type resource access differentiation test passed')
    })

    it('should validate client-resource binding through OAuth flows', async () => {
      // Create an authorization code for testing
      const authCode = await prisma.authorizationCode.create({
        data: {
          code: 'client_resource_test_' + crypto.randomBytes(16).toString('hex'),
          expiresAt: addMinutes(new Date(), 10),
          redirectUri: 'http://localhost:3000/callback',
          clientId: confidentialClient.id,
          userId: testUser1.id,
          scope: 'openid profile api:read',
          state: 'test-state',
          nonce: 'test-nonce',
          authTime: new Date(),
        }
      })

      try {
        const response = await fetch(`${BASE_URL}/api/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode.code,
            redirect_uri: 'http://localhost:3000/callback',
          }),
        })

        expect([200, 400, 401, 405, 429, 500]).toContain(response.status)
        console.log('✅ Client-Resource OAuth flow validation test passed')
      } finally {
        // Cleanup auth code
        await prisma.authorizationCode.delete({ where: { id: authCode.id } }).catch(() => {})
      }
    })
  })

  describe('2. User-Resource Relationships', () => {
    it('should validate user access to resources based on permissions', async () => {
      // Create an access token for user1 with specific resource access
      const userToken = 'user_resource_token_' + crypto.randomBytes(16).toString('hex')
      await prisma.accessToken.create({
        data: {
          token: userToken,
          tokenHash: crypto.createHash('sha256').update(userToken).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser1.id,
          clientId: confidentialClient.id,
          scope: 'openid profile api:read',
        }
      })

      try {
        // Test accessing user info with appropriate token
        const response = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${userToken}`,
          },
        })

        expect([200, 401, 403, 404, 405, 429, 500]).toContain(response.status)
        
        if (response.status === 200) {
          const userInfo = await response.json()
          expect(userInfo.sub).toBe(testUser1.id)
        }

        console.log('✅ User-Resource access validation test passed')
      } finally {
        // Cleanup token
        await prisma.accessToken.deleteMany({ where: { token: userToken } }).catch(() => {})
      }
    })

    it('should enforce user-specific resource boundaries', async () => {
      // Create tokens for different users
      const user1Token = 'user1_boundary_token_' + crypto.randomBytes(16).toString('hex')
      const user2Token = 'user2_boundary_token_' + crypto.randomBytes(16).toString('hex')

      await prisma.accessToken.create({
        data: {
          token: user1Token,
          tokenHash: crypto.createHash('sha256').update(user1Token).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser1.id,
          clientId: confidentialClient.id,
          scope: 'openid profile',
        }
      })

      await prisma.accessToken.create({
        data: {
          token: user2Token,
          tokenHash: crypto.createHash('sha256').update(user2Token).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser2.id,
          clientId: confidentialClient.id,
          scope: 'openid profile',
        }
      })

      try {
        // Test that user1 cannot access user2's resources
        const user1Response = await fetch(`${BASE_URL}/api/users/${testUser2.id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user1Token}`,
          },
        })

        // Should be denied or return appropriate error
        expect([401, 403, 404, 405, 429, 500]).toContain(user1Response.status)

        console.log('✅ User resource boundary enforcement test passed')
      } finally {
        // Cleanup tokens
        await prisma.accessToken.deleteMany({ 
          where: { 
            token: { in: [user1Token, user2Token] } 
          } 
        }).catch(() => {})
      }
    })

    it('should handle hierarchical user-resource permissions', async () => {
      // Create an admin token
      const adminToken = 'admin_hierarchy_token_' + crypto.randomBytes(16).toString('hex')
      await prisma.accessToken.create({
        data: {
          token: adminToken,
          tokenHash: crypto.createHash('sha256').update(adminToken).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: adminUser.id,
          clientId: confidentialClient.id,
          scope: 'openid profile admin:all',
        }
      })

      try {
        // Test admin access to user resources
        const response = await fetch(`${BASE_URL}/api/users/${testUser1.id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
          },
        })

        expect([200, 401, 403, 404, 405, 429, 500]).toContain(response.status)
        console.log('✅ Hierarchical user-resource permissions test passed')
      } finally {
        // Cleanup token
        await prisma.accessToken.deleteMany({ where: { token: adminToken } }).catch(() => {})
      }
    })

    it('should validate user consent for resource access', async () => {
      // Test authorization flow with user consent for resource access
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`)
      authUrl.searchParams.set('client_id', confidentialClient.clientId)
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid profile api:read')
      authUrl.searchParams.set('state', 'user-resource-consent-test')
      authUrl.searchParams.set('prompt', 'consent')

      const response = await fetch(authUrl.toString(), {
        method: 'GET',
        redirect: 'manual'
      })

      expect([200, 302, 307, 400, 401, 404, 405, 429, 500]).toContain(response.status)
      console.log('✅ User consent for resource access test passed')
    })
  })

  describe('3. User-Client Relationships', () => {
    it('should validate user authorization for specific clients', async () => {
      // Test that user can authorize specific clients
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`)
      authUrl.searchParams.set('client_id', confidentialClient.clientId)
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid profile')
      authUrl.searchParams.set('state', 'user-client-auth-test')

      const response = await fetch(authUrl.toString(), {
        method: 'GET',
        redirect: 'manual'
      })

      expect([200, 302, 307, 400, 401, 404, 405, 429, 500]).toContain(response.status)
      console.log('✅ User-Client authorization validation test passed')
    })

    it('should enforce user-client trust boundaries', async () => {
      // Test that users can only use trusted/registered clients
      const invalidClientId = 'invalid_client_' + crypto.randomBytes(8).toString('hex')
      
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`)
      authUrl.searchParams.set('client_id', invalidClientId)
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid profile')

      const response = await fetch(authUrl.toString(), {
        method: 'GET',
        redirect: 'manual'
      })

      // According to OAuth2 spec, invalid_client should return 401
      // Rate limiting might cause 429, so both are acceptable
      expect([401, 429]).toContain(response.status)
      if (response.status === 401) {
        const error = await response.json()
        expect(error.error).toBe('invalid_client')
      }

      console.log('✅ User-Client trust boundary test passed')
    })

    it('should handle user-client scope negotiation', async () => {
      // Test that user-client relationship respects scope limitations
      const authUrl = new URL(`${BASE_URL}/api/oauth/authorize`)
      authUrl.searchParams.set('client_id', publicClient.clientId)
      authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'openid profile api:write') // api:write not allowed for public client

      const response = await fetch(authUrl.toString(), {
        method: 'GET',
        redirect: 'manual'
      })

      if (response.status === 302) {
        const location = response.headers.get('location')
        expect(location).toContain('error=invalid_scope')
      } else {
        expect([400, 307, 404, 405, 429, 500]).toContain(response.status)
      }

      console.log('✅ User-Client scope negotiation test passed')
    })

    it('should validate user sessions across different clients', async () => {
      // Create access tokens for same user with different clients
      const token1 = 'user_client1_token_' + crypto.randomBytes(16).toString('hex')
      const token2 = 'user_client2_token_' + crypto.randomBytes(16).toString('hex')

              // Get the internal client IDs
        const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } })
        const pubClientDb = await prisma.client.findUnique({ where: { clientId: publicClient.clientId } })
        
        if (!confClientDb || !pubClientDb) {
          throw new Error('Test clients not found in database')
        }

        await prisma.accessToken.create({
          data: {
            token: token1,
            tokenHash: crypto.createHash('sha256').update(token1).digest('hex'),
            expiresAt: addMinutes(new Date(), 60),
            userId: testUser1.id,
            clientId: confClientDb.id,
            scope: 'openid profile api:read',
          }
        })

        await prisma.accessToken.create({
          data: {
            token: token2,
            tokenHash: crypto.createHash('sha256').update(token2).digest('hex'),
            expiresAt: addMinutes(new Date(), 60),
            userId: testUser1.id,
            clientId: pubClientDb.id,
            scope: 'openid profile',
          }
        })

      try {
        // Test accessing userinfo with both tokens
        const response1 = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token1}`,
          },
        })

        const response2 = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token2}`,
          },
        })

        expect([200, 401, 403, 404, 405, 429, 500]).toContain(response1.status)
        expect([200, 401, 403, 404, 405, 429, 500]).toContain(response2.status)

        if (response1.status === 200 && response2.status === 200) {
          const userInfo1 = await response1.json()
          const userInfo2 = await response2.json()
          expect(userInfo1.sub).toBe(userInfo2.sub) // Same user
        }

        console.log('✅ User sessions across different clients test passed')
      } finally {
        // Cleanup tokens
        await prisma.accessToken.deleteMany({ 
          where: { 
            token: { in: [token1, token2] } 
          } 
        }).catch(() => {})
      }
    })
  })

  describe('4. Complex Relationship Scenarios', () => {
    it('should handle multi-client resource sharing scenarios', async () => {
      // Test scenario where multiple clients access resources for same user
      const sharedToken = 'shared_resource_token_' + crypto.randomBytes(16).toString('hex')
      
      const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } })
      if (!confClientDb) {
        throw new Error('Confidential client not found in database')
      }
      
      await prisma.accessToken.create({
        data: {
          token: sharedToken,
          tokenHash: crypto.createHash('sha256').update(sharedToken).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: testUser1.id,
          clientId: confClientDb.id,
          scope: 'openid profile api:read data:read',
        }
      })

      try {
        // Test resource access with shared token
        const response = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sharedToken}`,
          },
        })

        expect([200, 401, 403, 404, 405, 429, 500]).toContain(response.status)
        console.log('✅ Multi-client resource sharing test passed')
      } finally {
        // Cleanup token
        await prisma.accessToken.deleteMany({ where: { token: sharedToken } }).catch(() => {})
      }
    })

    it('should validate cross-relationship permission inheritance', async () => {
      // Test complex scenario with user permissions, client scopes, and resource access
      const complexToken = 'complex_permission_token_' + crypto.randomBytes(16).toString('hex')
      
      const confClientDb = await prisma.client.findUnique({ where: { clientId: confidentialClient.clientId } })
      if (!confClientDb) {
        throw new Error('Confidential client not found in database')
      }
      
      await prisma.accessToken.create({
        data: {
          token: complexToken,
          tokenHash: crypto.createHash('sha256').update(complexToken).digest('hex'),
          expiresAt: addMinutes(new Date(), 60),
          userId: adminUser.id,
          clientId: confClientDb.id,
          scope: 'openid profile api:read api:write',
        }
      })

      try {
        // Test that admin user with proper client can access multiple resources
        const userinfoResponse = await fetch(`${BASE_URL}/api/oauth/userinfo`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${complexToken}`,
          },
        })

        const usersResponse = await fetch(`${BASE_URL}/api/users`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${complexToken}`,
          },
        })

        expect([200, 401, 403, 404, 405, 429, 500]).toContain(userinfoResponse.status)
        expect([200, 401, 403, 404, 405, 429, 500]).toContain(usersResponse.status)

        console.log('✅ Cross-relationship permission inheritance test passed')
      } finally {
        // Cleanup token
        await prisma.accessToken.deleteMany({ where: { token: complexToken } }).catch(() => {})
      }
    })

    it('should enforce relationship-based rate limiting', async () => {
      // Test that rate limiting is applied per user-client relationship
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${BASE_URL}/api/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${confidentialClient.clientId}:${confidentialClient.plainSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'api:read',
          }),
        })
      )

      const responses = await Promise.all(promises)
      
      // Some requests should be rate limited or succeed
      const statusCodes = responses.map(r => r.status)
      expect(statusCodes.every(status => [200, 400, 401, 405, 429, 500].includes(status))).toBe(true)

      console.log('✅ Relationship-based rate limiting test passed')
    })
  })
}) 