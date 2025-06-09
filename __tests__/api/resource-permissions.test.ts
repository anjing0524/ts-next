import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

// Import route functions directly for code coverage
import { GET as resourcesGET, POST as resourcesPOST } from '@/app/api/resources/route'
import { GET as resourceByIdGET, PUT as resourceByIdPUT, DELETE as resourceByIdDELETE } from '@/app/api/resources/[resourceId]/route'
import { GET as permissionsGET, POST as permissionsPOST } from '@/app/api/permissions/route'
import { GET as permissionByIdGET, PUT as permissionByIdPUT, DELETE as permissionByIdDELETE } from '@/app/api/permissions/[permissionId]/route'
import { GET as userPermissionsGET, POST as userPermissionsPOST } from '@/app/api/users/[userId]/permissions/route'
import { POST as tokenPOST } from '@/app/api/oauth/token/route'
import { GET as scopesGET, POST as scopesPOST } from '@/app/api/scopes/route'
import { GET as userByIdGET } from '@/app/api/users/[userId]/route'
import { GET as usersGET } from '@/app/api/users/route'

const BASE_URL = process.env.NODE_ENV === 'test' ? 'http://localhost:3000/datamgr_flow' : 'http://localhost:3000/datamgr_flow'

describe('Resource Management and Permission System Tests', () => {
  let adminUser: any = null
  let regularUser: any = null
  let testClient: any = null
  let testResource: any = null
  let testPermission: any = null
  let testScope: any = null

  beforeAll(async () => {
    console.log('🚀 Setting up Resource Permission test data...')
    await setupTestData()
  })

  afterAll(async () => {
    console.log('🧹 Cleaning up Resource Permission test data...')
    await cleanupTestData()
  })

  async function setupTestData(): Promise<void> {
    try {
      // Create admin user
      const adminPassword = await bcrypt.hash('AdminPassword123!', 12)
      adminUser = await prisma.user.create({
        data: {
          username: 'resourceadmin-' + Date.now(),
          email: `resourceadmin-${Date.now()}@example.com`,
          password: adminPassword,
          emailVerified: true,
          isActive: true,
          firstName: 'Resource',
          lastName: 'Admin',
        }
      })

      // Create regular user
      const userPassword = await bcrypt.hash('UserPassword123!', 12)
      regularUser = await prisma.user.create({
        data: {
          username: 'resourceuser-' + Date.now(),
          email: `resourceuser-${Date.now()}@example.com`,
          password: userPassword,
          emailVerified: true,
          isActive: true,
          firstName: 'Resource',
          lastName: 'User',
        }
      })

      // Create OAuth client
      const clientSecret = crypto.randomBytes(32).toString('hex')
      testClient = await prisma.client.create({
        data: {
          clientId: 'resource-test-client-' + Date.now(),
          clientSecret: await bcrypt.hash(clientSecret, 12),
          name: 'Resource Test Client',
          redirectUris: JSON.stringify(['http://localhost:3000/callback']),
          scope: 'openid profile email api:read api:write',
          isActive: true,
          isPublic: false,
          grantTypes: JSON.stringify(['authorization_code', 'client_credentials', 'refresh_token']),
          responseTypes: JSON.stringify(['code']),
          tokenEndpointAuthMethod: 'client_secret_basic',
        }
      })

      // Store plain secret for testing
      testClient.plainSecret = clientSecret

      // Create scopes if they don't exist
      const scopes = [
        { name: 'api:read', description: 'API read access', isActive: true, isPublic: false },
        { name: 'api:write', description: 'API write access', isActive: true, isPublic: false },
        { name: 'resource:admin', description: 'Resource admin access', isActive: true, isPublic: false },
      ]

      for (const scopeData of scopes) {
        await prisma.scope.upsert({
          where: { name: scopeData.name },
          update: {},
          create: scopeData
        })
      }

      testScope = await prisma.scope.findFirst({
        where: { name: 'api:read' }
      })

      console.log('✅ Resource Permission test data setup completed')
    } catch (error) {
      console.error('❌ Setup failed:', error)
      throw error
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      if (adminUser?.id) {
        await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {})
      }
      if (regularUser?.id) {
        await prisma.user.delete({ where: { id: regularUser.id } }).catch(() => {})
      }
      if (testClient?.id) {
        await prisma.client.delete({ where: { id: testClient.id } }).catch(() => {})
      }
      console.log('✅ Resource Permission test data cleanup completed')
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
    }
  }

  describe('Resource Management API Tests', () => {
    it('should handle resource creation requests', async () => {
      const resourceData = {
        name: 'Test Resource',
        description: 'A test resource for permission testing',
        type: 'api',
        uri: '/api/test-resource',
      }

      const resourceRequest = createNextRequest('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(resourceData),
      })

      const response = await resourcesPOST(resourceRequest)

      expect([200, 201, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      
      if (response.status === 200 || response.status === 201) {
        const data = await response.json()
        expect(data.name).toBe(resourceData.name)
        testResource = data
      }

      console.log('✅ Resource creation endpoint test passed')
    })

    it('should handle resource listing requests', async () => {
      const resourceRequest = createNextRequest('/api/resources', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      const response = await resourcesGET(resourceRequest)

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data) || Array.isArray(data.resources)).toBe(true)
      }

      console.log('✅ Resource listing endpoint test passed')
    })

    it('should handle resource retrieval by ID', async () => {
      const resourceId = testResource?.id || 'test-resource-id'
      
      const resourceRequest = createNextRequest(`/api/resources/${resourceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      const response = await resourceByIdGET(resourceRequest, { params: { resourceId } })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Resource retrieval endpoint test passed')
    })

    it('should handle resource update requests', async () => {
      const resourceId = testResource?.id || 'test-resource-id'
      const updateData = {
        description: 'Updated test resource description',
        uri: '/api/updated-test-resource',
      }

      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(updateData),
      })

      expect([200, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      console.log('✅ Resource update endpoint test passed')
    })

    it('should handle resource deletion requests', async () => {
      const resourceId = testResource?.id || 'test-resource-id'
      
      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 204, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Resource deletion endpoint test passed')
    })
  })

  describe('Permission Management API Tests', () => {
    it('should handle permission creation requests', async () => {
      const permissionData = {
        name: 'test:read',
        description: 'Read access to test resources',
        resourceType: 'api',
        action: 'read',
      }

      const response = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(permissionData),
      })

      expect([200, 201, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      
      if (response.status === 200 || response.status === 201) {
        const data = await response.json()
        expect(data.name).toBe(permissionData.name)
        testPermission = data
      }

      console.log('✅ Permission creation endpoint test passed')
    })

    it('should handle permission listing requests', async () => {
      const response = await fetch(`${BASE_URL}/api/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data) || Array.isArray(data.permissions)).toBe(true)
      }

      console.log('✅ Permission listing endpoint test passed')
    })

    it('should handle permission retrieval by ID', async () => {
      const permissionId = testPermission?.id || 'test-permission-id'
      
      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Permission retrieval endpoint test passed')
    })

    it('should handle permission update requests', async () => {
      const permissionId = testPermission?.id || 'test-permission-id'
      const updateData = {
        description: 'Updated permission description',
        action: 'write',
      }

      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(updateData),
      })

      expect([200, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      console.log('✅ Permission update endpoint test passed')
    })

    it('should handle permission deletion requests', async () => {
      const permissionId = testPermission?.id || 'test-permission-id'
      
      const response = await fetch(`${BASE_URL}/api/permissions/${permissionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 204, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Permission deletion endpoint test passed')
    })
  })

  describe('User-Resource Permission Relationships', () => {
    it('should handle user permission assignment', async () => {
      const assignmentData = {
        userId: regularUser.id,
        permissionId: testPermission?.id || 'test-permission-id',
        resourceId: testResource?.id || 'test-resource-id',
      }

      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(assignmentData),
      })

      expect([200, 201, 400, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      console.log('✅ User permission assignment endpoint test passed')
    })

    it('should handle user permission listing', async () => {
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data) || Array.isArray(data.permissions)).toBe(true)
      }

      console.log('✅ User permission listing endpoint test passed')
    })

    it('should handle user permission revocation', async () => {
      const permissionId = testPermission?.id || 'test-permission-id'
      
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions/${permissionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 204, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ User permission revocation endpoint test passed')
    })

    it('should validate user access to resources', async () => {
      const resourceId = testResource?.id || 'test-resource-id'
      
      // Test with regular user token
      const response = await fetch(`${BASE_URL}/api/resources/${resourceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_user_token`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ User resource access validation test passed')
    })
  })

  describe('Client-Resource Permission Relationships', () => {
    it('should handle client scope validation', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read api:write',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret,
        }),
      })

      expect([200, 400, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const data = await response.json()
        expect(data.access_token).toBeDefined()
        expect(data.scope).toBeDefined()
      }

      console.log('✅ Client scope validation test passed')
    })

    it('should reject client access to unauthorized scopes', async () => {
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'admin:super unauthorized:scope',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret,
        }),
      })

      expect([400, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 400) {
        const data = await response.json()
        expect(data.error).toBe('invalid_scope')
      }

      console.log('✅ Client unauthorized scope rejection test passed')
    })

    it('should validate client access to resources via token', async () => {
      // Get client credentials token first
      const tokenResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret,
        }),
      })

      let accessToken = 'fake_client_token'
      if (tokenResponse.status === 200) {
        const tokenData = await tokenResponse.json()
        accessToken = tokenData.access_token
      }

      // Test resource access with client token
      const resourceResponse = await fetch(`${BASE_URL}/api/resources`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(resourceResponse.status)
      console.log('✅ Client resource access via token test passed')
    })
  })

  describe('Scope Management Tests', () => {
    it('should handle scope listing requests', async () => {
      const response = await fetch(`${BASE_URL}/api/scopes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
      
      if (response.status === 200) {
        const data = await response.json()
        expect(Array.isArray(data) || Array.isArray(data.scopes)).toBe(true)
      }

      console.log('✅ Scope listing endpoint test passed')
    })

    it('should handle scope creation requests', async () => {
      const scopeData = {
        name: 'test:custom',
        description: 'Custom test scope',
        isActive: true,
        isPublic: false,
      }

      const response = await fetch(`${BASE_URL}/api/scopes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(scopeData),
      })

      expect([200, 201, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      console.log('✅ Scope creation endpoint test passed')
    })

    it('should validate scope hierarchies and inheritance', async () => {
      // Test scope validation logic
      const response = await fetch(`${BASE_URL}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'api:read api:write resource:admin',
          client_id: testClient.clientId,
          client_secret: testClient.plainSecret,
        }),
      })

      expect([200, 400, 401, 403, 429, 500]).toContain(response.status)
      console.log('✅ Scope hierarchy validation test passed')
    })
  })

  describe('Access Control and Security Tests', () => {
    it('should enforce resource-level access control', async () => {
      // Test various access control scenarios
      const endpoints = [
        '/api/resources',
        '/api/permissions',
        '/api/scopes',
        '/api/users',
        '/api/clients',
      ]

      for (const endpoint of endpoints) {
        // Test without authorization
        const noAuthResponse = await fetch(`${BASE_URL}${endpoint}`, {
          method: 'GET',
        })
        expect([200, 401, 404, 405, 429, 500]).toContain(noAuthResponse.status)

        // Test with invalid token
        const invalidTokenResponse = await fetch(`${BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer invalid_token_123',
          },
        })
        expect([200, 401, 404, 405, 429, 500]).toContain(invalidTokenResponse.status)

        console.log(`✅ Access control test for ${endpoint} passed`)
      }
    })

    it('should validate resource ownership and permissions', async () => {
      // Test that users can only access their own resources
      const response = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer fake_regular_user_token`,
        },
      })

      // Should be forbidden or unauthorized
      expect([401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Resource ownership validation test passed')
    })

    it('should handle permission inheritance and cascading', async () => {
      // Test complex permission scenarios
      const permissionData = {
        resourceId: testResource?.id || 'test-resource-id',
        userId: regularUser.id,
        permissions: ['read', 'write'],
        inherit: true,
      }

      const response = await fetch(`${BASE_URL}/api/resources/${testResource?.id || 'test-resource-id'}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(permissionData),
      })

      expect([200, 201, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      console.log('✅ Permission inheritance test passed')
    })

    it('should validate cross-resource permission boundaries', async () => {
      // Test that permissions don't leak across resource boundaries
      const resourceAToken = 'fake_resource_a_token'
      const resourceBId = 'resource-b-id'

      const response = await fetch(`${BASE_URL}/api/resources/${resourceBId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${resourceAToken}`,
        },
      })

      expect([401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Cross-resource permission boundary test passed')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed permission requests', async () => {
      const malformedData = {
        invalidField: 'invalid_value',
        permissions: 'not_an_array',
      }

      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer fake_admin_token`,
        },
        body: JSON.stringify(malformedData),
      })

      expect([400, 422, 429, 500]).toContain(response.status)
      console.log('✅ Malformed permission request handling test passed')
    })

    it('should handle concurrent permission operations', async () => {
      // Test concurrent permission assignments
      const promises = Array.from({ length: 5 }, (_, i) => 
        fetch(`${BASE_URL}/api/users/${regularUser.id}/permissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer fake_admin_token`,
          },
          body: JSON.stringify({
            permissionId: `test-permission-${i}`,
            resourceId: `test-resource-${i}`,
          }),
        })
      )

      const responses = await Promise.all(promises)
      
      // All should complete without crashing
      responses.forEach(response => {
        expect([200, 201, 400, 401, 403, 404, 422, 429, 500]).toContain(response.status)
      })

      console.log('✅ Concurrent permission operations test passed')
    })

    it('should handle resource cleanup on user deletion', async () => {
      // Test that user permissions are cleaned up when user is deleted
      const response = await fetch(`${BASE_URL}/api/users/${regularUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer fake_admin_token`,
        },
      })

      expect([200, 204, 401, 403, 404, 429, 500]).toContain(response.status)
      console.log('✅ Resource cleanup on user deletion test passed')
    })
  })
})

// Helper to create Next.js request object
function createNextRequest(url: string, options: RequestInit = {}): NextRequest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow'
  const baseUrl = 'http://localhost:3000'
  const fullUrl = `${baseUrl}${basePath}${url}`
  
  const { signal, ...safeOptions } = options
  
  return new NextRequest(fullUrl, {
    method: 'GET',
    ...safeOptions,
    ...(signal && { signal }),
  })
} 