// __tests__/api/v2/clients/route.test.ts

import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/v2/clients/route'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import * as jose from 'jose'

// Mock the auth middleware
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: (permission: string) => (handler: any) => {
    return async (req: any) => {
      // Mock user with required permission
      req.user = {
        id: 'test-admin-id',
        username: 'testadmin',
        permissions: [permission]
      }
      return handler(req)
    }
  }
}))

// Mock the oauth2 utils
jest.mock('@/lib/auth/oauth2', () => ({
  AuthorizationUtils: {
    logAuditEvent: jest.fn().mockResolvedValue(undefined)
  }
}))

describe('/api/v2/clients', () => {
  beforeEach(async () => {
    // Clean up test data before each test
    await global.testUtils.cleanupTestData()
  })

  afterEach(async () => {
    // Clean up test data after each test
    await global.testUtils.cleanupTestData()
  })

  describe('GET /api/v2/clients', () => {
    it('should return a list of clients with pagination', async () => {
      // Create test clients
      const client1 = await global.testUtils.createTestClient({
        clientId: 'test_client_1',
        name: 'Test Client 1',
        clientType: 'PUBLIC'
      })
      
      const client2 = await global.testUtils.createTestClient({
        clientId: 'test_client_2', 
        name: 'Test Client 2',
        clientType: 'CONFIDENTIAL'
      })

      const request = new NextRequest('http://localhost:3000/api/v2/clients?page=1&pageSize=10')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.clients).toHaveLength(2)
      expect(data.total).toBe(2)
      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(10)
      expect(data.totalPages).toBe(1)
      
      // Verify client data structure
      expect(data.clients[0]).toHaveProperty('id')
      expect(data.clients[0]).toHaveProperty('clientId')
      expect(data.clients[0]).toHaveProperty('name')
      expect(data.clients[0]).not.toHaveProperty('clientSecret') // Should not expose secret hash
    })

    it('should filter clients by name', async () => {
      await global.testUtils.createTestClient({
        clientId: 'test_client_1',
        name: 'Production Client'
      })
      
      await global.testUtils.createTestClient({
        clientId: 'test_client_2',
        name: 'Development Client'
      })

      const request = new NextRequest('http://localhost:3000/api/v2/clients?clientName=Production')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.clients).toHaveLength(1)
      expect(data.clients[0].name).toBe('Production Client')
    })

    it('should filter clients by clientId', async () => {
      await global.testUtils.createTestClient({
        clientId: 'prod_client_123',
        name: 'Production Client'
      })
      
      await global.testUtils.createTestClient({
        clientId: 'dev_client_456',
        name: 'Development Client'
      })

      const request = new NextRequest('http://localhost:3000/api/v2/clients?clientId=prod')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.clients).toHaveLength(1)
      expect(data.clients[0].clientId).toBe('prod_client_123')
    })

    it('should filter clients by clientType', async () => {
      await global.testUtils.createTestClient({
        clientId: 'public_client',
        clientType: 'PUBLIC'
      })
      
      await global.testUtils.createTestClient({
        clientId: 'confidential_client',
        clientType: 'CONFIDENTIAL'
      })

      const request = new NextRequest('http://localhost:3000/api/v2/clients?clientType=PUBLIC')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.clients).toHaveLength(1)
      expect(data.clients[0].clientType).toBe('PUBLIC')
    })

    it('should handle pagination parameters correctly', async () => {
      // Create 15 test clients
      for (let i = 1; i <= 15; i++) {
        await global.testUtils.createTestClient({
          clientId: `test_client_${i}`,
          name: `Test Client ${i}`
        })
      }

      // Test first page
      const request1 = new NextRequest('http://localhost:3000/api/v2/clients?page=1&pageSize=5')
      const response1 = await GET(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      expect(data1.clients).toHaveLength(5)
      expect(data1.total).toBe(15)
      expect(data1.page).toBe(1)
      expect(data1.pageSize).toBe(5)
      expect(data1.totalPages).toBe(3)

      // Test second page
      const request2 = new NextRequest('http://localhost:3000/api/v2/clients?page=2&pageSize=5')
      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.clients).toHaveLength(5)
      expect(data2.page).toBe(2)
    })

    it('should enforce maximum page size limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/clients?pageSize=100')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.pageSize).toBe(50) // Should be capped at MAX_PAGE_SIZE_CLIENTS
    })

    it('should sort clients by different fields', async () => {
      await global.testUtils.createTestClient({
        clientId: 'z_client',
        name: 'Z Client'
      })
      
      await global.testUtils.createTestClient({
        clientId: 'a_client',
        name: 'A Client'
      })

      // Sort by clientId ascending
      const request = new NextRequest('http://localhost:3000/api/v2/clients?sortBy=clientId&sortOrder=asc')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.clients[0].clientId).toBe('a_client')
      expect(data.clients[1].clientId).toBe('z_client')
    })
  })

  describe('POST /api/v2/clients', () => {
    it('should create a new public client successfully', async () => {
      const clientData = {
        clientName: 'Test Public Client',
        clientDescription: 'A test public client',
        clientType: 'PUBLIC',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        allowedScopes: ['read'],
        tokenEndpointAuthMethod: 'none'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.clientName).toBe(clientData.clientName)
      expect(data.clientType).toBe('PUBLIC')
      expect(data.tokenEndpointAuthMethod).toBe('none')
      expect(data.requirePkce).toBe(true) // Should be forced to true for public clients
      expect(data).not.toHaveProperty('clientSecret') // Public clients don't have secrets
      expect(data.redirectUris).toEqual(clientData.redirectUris)
      expect(data.grantTypes).toEqual(clientData.grantTypes)
    })

    it('should create a new confidential client with generated secret', async () => {
      const clientData = {
        clientName: 'Test Confidential Client',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code', 'client_credentials'],
        responseTypes: ['code'],
        allowedScopes: ['read', 'write'],
        tokenEndpointAuthMethod: 'client_secret_basic'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.clientName).toBe(clientData.clientName)
      expect(data.clientType).toBe('CONFIDENTIAL')
      expect(data.tokenEndpointAuthMethod).toBe('client_secret_basic')
      expect(data.clientSecret).toBeDefined() // Should return plain text secret on creation
      expect(typeof data.clientSecret).toBe('string')
      expect(data.clientSecret.length).toBeGreaterThan(0)
    })

    it('should create a new confidential client with provided secret', async () => {
      const providedSecret = 'my-custom-secret-123'
      const clientData = {
        clientName: 'Test Confidential Client',
        clientType: 'CONFIDENTIAL',
        clientSecret: providedSecret,
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'client_secret_post'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.clientSecret).toBe(providedSecret) // Should return the provided secret
      
      // Verify the secret is properly hashed in database
      const dbClient = await prisma.oAuthClient.findUnique({
        where: { clientId: data.clientId }
      })
      expect(dbClient?.clientSecret).not.toBe(providedSecret) // Should be hashed
      expect(await bcrypt.compare(providedSecret, dbClient?.clientSecret || '')).toBe(true)
    })

    it('should create confidential client with private_key_jwt auth method', async () => {
      const clientData = {
        clientName: 'JWT Auth Client',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'private_key_jwt',
        jwksUri: 'https://example.com/.well-known/jwks.json'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.tokenEndpointAuthMethod).toBe('private_key_jwt')
      expect(data.jwksUri).toBe(clientData.jwksUri)
      expect(data).not.toHaveProperty('clientSecret') // No secret for JWT auth
    })

    it('should return 400 for invalid payload', async () => {
      const invalidData = {
        clientName: '', // Invalid: empty name
        clientType: 'INVALID_TYPE', // Invalid type
        redirectUris: [], // Invalid: empty array
        grantTypes: [] // Invalid: empty array
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(invalidData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Validation failed')
      expect(data.issues).toBeDefined()
      expect(Array.isArray(data.issues)).toBe(true)
    })

    it('should return 409 if clientId already exists', async () => {
      const existingClientId = 'existing_client_123'
      
      // Create existing client
      await global.testUtils.createTestClient({
        clientId: existingClientId,
        name: 'Existing Client'
      })

      const clientData = {
        clientId: existingClientId, // Same ID
        clientName: 'New Client',
        clientType: 'PUBLIC',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('Conflict')
      expect(data.message).toContain('Client ID already exists')
    })

    it('should handle different tokenEndpointAuthMethods correctly', async () => {
      const authMethods = [
        { method: 'client_secret_basic', requiresSecret: true },
        { method: 'client_secret_post', requiresSecret: true },
        { method: 'private_key_jwt', requiresSecret: false },
        { method: 'none', requiresSecret: false }
      ]

      for (const { method, requiresSecret } of authMethods) {
        const clientData: any = {
          clientName: `Test Client ${method}`,
          clientType: method === 'none' ? 'PUBLIC' : 'CONFIDENTIAL',
          redirectUris: ['https://example.com/callback'],
          grantTypes: ['authorization_code'],
          responseTypes: ['code'],
          tokenEndpointAuthMethod: method
        }

        if (method === 'private_key_jwt') {
          clientData.jwksUri = 'https://example.com/.well-known/jwks.json'
        }

        const request = new NextRequest('http://localhost:3000/api/v2/clients', {
          method: 'POST',
          body: JSON.stringify(clientData),
          headers: {
            'Content-Type': 'application/json'
          }
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(data.tokenEndpointAuthMethod).toBe(method)
        
        if (requiresSecret && clientData.clientType === 'CONFIDENTIAL') {
          expect(data.clientSecret).toBeDefined()
        } else {
          expect(data).not.toHaveProperty('clientSecret')
        }
      }
    })

    it('should require jwksUri for private_key_jwt auth method', async () => {
      const clientData = {
        clientName: 'JWT Client Without JWKS',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'private_key_jwt'
        // Missing jwksUri
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Validation failed')
      expect(data.issues.some((issue: any) => 
        issue.path.includes('jwksUri') && 
        issue.message.includes('jwksUri is required')
      )).toBe(true)
    })

    it('should require clientSecret for secret-based auth methods', async () => {
      const clientData = {
        clientName: 'Confidential Client Without Secret',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'client_secret_basic'
        // Missing clientSecret - should be auto-generated
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      // Should succeed with auto-generated secret
      expect(response.status).toBe(201)
      expect(data.clientSecret).toBeDefined()
      expect(typeof data.clientSecret).toBe('string')
    })

    it('should enforce none auth method for public clients', async () => {
      const clientData = {
        clientName: 'Public Client with Wrong Auth',
        clientType: 'PUBLIC',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'client_secret_basic' // Invalid for public client
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Validation failed')
      expect(data.issues.some((issue: any) => 
        issue.message.includes('Public clients must use \'none\' as tokenEndpointAuthMethod')
      )).toBe(true)
    })

    it('should return 400 for invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: 'invalid json{',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
      expect(data.message).toContain('Failed to parse JSON body')
    })

    it('should generate random clientId when not provided', async () => {
      const clientData = {
        clientName: 'Auto ID Client',
        clientType: 'PUBLIC',
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.clientId).toBeDefined()
      expect(data.clientId).toMatch(/^client_[a-f0-9]{24}$/) // Should match generated pattern
    })

    it('should set default values correctly', async () => {
      const clientData = {
        clientName: 'Default Values Client',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code']
        // Many optional fields omitted to test defaults
      }

      const request = new NextRequest('http://localhost:3000/api/v2/clients', {
        method: 'POST',
        body: JSON.stringify(clientData),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.responseTypes).toEqual(['code']) // Default value
      expect(data.requirePkce).toBe(true) // Default value
      expect(data.requireConsent).toBe(true) // Default value
      expect(data.tokenEndpointAuthMethod).toBe('client_secret_basic') // Default value
      expect(data.isActive).toBe(true) // Default value
      expect(data.strictRedirectUriMatching).toBe(true) // Default value
      expect(data.allowLocalhostRedirect).toBe(false) // Default value
      expect(data.requireHttpsRedirect).toBe(true) // Default value
    })
  })
})