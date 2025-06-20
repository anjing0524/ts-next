// __tests__/api/v2/permissions/route.test.ts

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/v2/permissions/route'
import { prisma } from '@/lib/prisma'
import { PermissionType, HttpMethod } from '@prisma/client'

// Mock the authentication middleware
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn().mockImplementation((permission) => {
    return (handler: any) => {
      return async (request: NextRequest) => {
        // Mock authentication context
        const mockContext = {
          user: {
            id: 'admin_user_id',
            username: 'admin',
            email: 'admin@example.com',
            roles: ['admin']
          },
          permissions: ['permissions:create', 'permissions:list', 'permissions:read', 'permissions:update', 'permissions:delete']
        }
        
        // Check if user has required permission
        if (permission && !mockContext.permissions.includes(permission)) {
          return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          })
        }
        
        return handler(request, mockContext)
      }
    }
  })
}))

// Mock the OAuth2 utilities
jest.mock('@/lib/auth/oauth2', () => ({
  AuthorizationUtils: {
    logAuditEvent: jest.fn().mockResolvedValue(undefined)
  }
}))

// Mock the error handling wrapper
jest.mock('@/lib/errors', () => ({
  withErrorHandling: jest.fn().mockImplementation((handler) => handler),
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ValidationError'
    }
  }
}))

describe('/api/v2/permissions', () => {
  let testPermission: any
  let adminUser: any

  beforeEach(async () => {
    // Clean up test data
    await global.testUtils.cleanupTestData()

    // Create admin user
    adminUser = await global.testUtils.createTestUser({
      username: 'admin',
      email: 'admin@example.com',
      roles: ['admin']
    })

    // Create test permission
    testPermission = await prisma.permission.create({
      data: {
        name: 'test:read',
        displayName: 'Test Read Permission',
        description: 'Permission to read test resources',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read',
        isActive: true
      }
    })

    // Create API permission details
    await prisma.apiPermission.create({
      data: {
        permissionId: testPermission.id,
        httpMethod: HttpMethod.GET,
        endpoint: '/api/test',
        rateLimit: 100
      }
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('POST /api/v2/permissions (Create Permission)', () => {
    it('should create a new API permission successfully', async () => {
      const permissionData = {
        name: 'users:create',
        displayName: 'Create Users',
        description: 'Permission to create new users',
        type: PermissionType.API,
        resource: '/api/users',
        action: 'create',
        isActive: true,
        apiDetails: {
          httpMethod: HttpMethod.POST,
          endpoint: '/api/users',
          rateLimit: 50
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.permission).toBeDefined()
      expect(data.permission.name).toBe('users:create')
      expect(data.permission.displayName).toBe('Create Users')
      expect(data.permission.type).toBe(PermissionType.API)
      expect(data.permission.apiPermission).toBeDefined()
      expect(data.permission.apiPermission.httpMethod).toBe(HttpMethod.POST)
      expect(data.permission.apiPermission.endpoint).toBe('/api/users')
      expect(data.permission.apiPermission.rateLimit).toBe(50)

      // Verify permission was created in database
      const createdPermission = await prisma.permission.findUnique({
        where: { name: 'users:create' },
        include: { apiPermission: true }
      })
      expect(createdPermission).toBeTruthy()
      expect(createdPermission?.apiPermission).toBeTruthy()
    })

    it('should create a new MENU permission successfully', async () => {
      // Create a test menu first
      const menu = await prisma.menu.create({
        data: {
          key: 'test_menu',
          name: 'Test Menu',
          path: '/test',
          icon: 'test-icon',
          sortOrder: 1
        }
      })

      const permissionData = {
        name: 'menu:test_access',
        displayName: 'Test Menu Access',
        description: 'Permission to access test menu',
        type: PermissionType.MENU,
        resource: 'test_menu',
        action: 'access',
        isActive: true,
        menuDetails: {
          menuId: menu.id
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.permission.type).toBe(PermissionType.MENU)
      expect(data.permission.menuPermission).toBeDefined()
      expect(data.permission.menuPermission.menuId).toBe(menu.id)
    })

    it('should create a new DATA permission successfully', async () => {
      const permissionData = {
        name: 'data:users_read',
        displayName: 'Read User Data',
        description: 'Permission to read user data',
        type: PermissionType.DATA,
        resource: 'users',
        action: 'read',
        isActive: true,
        dataDetails: {
          tableName: 'users',
          columnName: 'email',
          conditions: JSON.stringify({ isActive: true })
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.permission.type).toBe(PermissionType.DATA)
      expect(data.permission.dataPermission).toBeDefined()
      expect(data.permission.dataPermission.tableName).toBe('users')
      expect(data.permission.dataPermission.columnName).toBe('email')
    })

    it('should validate required fields', async () => {
      const invalidPermissionData = {
        displayName: 'Invalid Permission'
        // Missing name, type, resource, action
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(invalidPermissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('validation failed')
      expect(data.errors).toBeDefined()
    })

    it('should validate permission name format', async () => {
      const permissionData = {
        name: 'invalid name!', // Invalid characters
        displayName: 'Invalid Permission',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: '/api/test'
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.errors.name).toBeDefined()
    })

    it('should require apiDetails for API type permissions', async () => {
      const permissionData = {
        name: 'api:test',
        displayName: 'API Test Permission',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read'
        // Missing apiDetails
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.errors.apiDetails).toBeDefined()
    })

    it('should require menuDetails for MENU type permissions', async () => {
      const permissionData = {
        name: 'menu:test',
        displayName: 'Menu Test Permission',
        type: PermissionType.MENU,
        resource: 'test_menu',
        action: 'access'
        // Missing menuDetails
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.errors.menuDetails).toBeDefined()
    })

    it('should require dataDetails for DATA type permissions', async () => {
      const permissionData = {
        name: 'data:test',
        displayName: 'Data Test Permission',
        type: PermissionType.DATA,
        resource: 'test_table',
        action: 'read'
        // Missing dataDetails
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.errors.dataDetails).toBeDefined()
    })

    it('should prevent duplicate permission names', async () => {
      const permissionData = {
        name: testPermission.name, // Use existing permission name
        displayName: 'Duplicate Permission',
        type: PermissionType.API,
        resource: '/api/duplicate',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: '/api/duplicate'
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.message).toContain('already exists')
    })

    it('should validate API endpoint format', async () => {
      const permissionData = {
        name: 'api:invalid_endpoint',
        displayName: 'Invalid Endpoint Permission',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: 'invalid-endpoint' // Should start with '/'
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.errors.apiDetails).toBeDefined()
    })

    it('should require permissions:create permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission) => {
        return (handler: any) => {
          return async (request: NextRequest) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const permissionData = {
        name: 'test:permission',
        displayName: 'Test Permission',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: '/api/test'
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer limited_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })

    it('should set default values for optional fields', async () => {
      const permissionData = {
        name: 'minimal:permission',
        displayName: 'Minimal Permission',
        type: PermissionType.API,
        resource: '/api/minimal',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: '/api/minimal'
        }
        // No description, isActive defaults to true
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.permission.isActive).toBe(true)
      expect(data.permission.description).toBeNull()
    })
  })

  describe('GET /api/v2/permissions (List Permissions)', () => {
    beforeEach(async () => {
      // Create additional test permissions for pagination testing
      for (let i = 1; i <= 15; i++) {
        const permission = await prisma.permission.create({
          data: {
            name: `test:permission${i}`,
            displayName: `Test Permission ${i}`,
            description: `Test permission number ${i}`,
            type: i % 3 === 0 ? PermissionType.MENU : i % 2 === 0 ? PermissionType.DATA : PermissionType.API,
            resource: `/api/test${i}`,
            action: i % 2 === 0 ? 'read' : 'write',
            isActive: i % 4 !== 0 // Some inactive permissions
          }
        })

        // Create type-specific details
        if (permission.type === PermissionType.API) {
          await prisma.apiPermission.create({
            data: {
              permissionId: permission.id,
              httpMethod: i % 2 === 0 ? HttpMethod.GET : HttpMethod.POST,
              endpoint: `/api/test${i}`
            }
          })
        }
      }
    })

    it('should list permissions with default pagination', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      expect(data.pagination).toBeDefined()
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.pageSize).toBe(10)
      expect(data.pagination.totalItems).toBeGreaterThan(15)
      expect(data.data).toHaveLength(10) // Default page size
    })

    it('should support custom pagination', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('page', '2')
      url.searchParams.set('pageSize', '5')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.pagination.page).toBe(2)
      expect(data.pagination.pageSize).toBe(5)
      expect(data.data).toHaveLength(5)
    })

    it('should support filtering by permission name', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('name', 'permission1')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.length).toBeGreaterThan(0)
      expect(data.data.every((permission: any) => 
        permission.name.includes('permission1')
      )).toBe(true)
    })

    it('should support filtering by permission type', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('type', PermissionType.API)

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.every((permission: any) => 
        permission.type === PermissionType.API
      )).toBe(true)
    })

    it('should support filtering by resource', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('resource', 'test1')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.every((permission: any) => 
        permission.resource.includes('test1')
      )).toBe(true)
    })

    it('should support filtering by action', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('action', 'read')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.every((permission: any) => 
        permission.action.includes('read')
      )).toBe(true)
    })

    it('should include type-specific details', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Check that API permissions include apiPermission details
      const apiPermissions = data.data.filter((p: any) => p.type === PermissionType.API)
      if (apiPermissions.length > 0) {
        expect(apiPermissions[0].apiPermission).toBeDefined()
        expect(apiPermissions[0].apiPermission.httpMethod).toBeDefined()
        expect(apiPermissions[0].apiPermission.endpoint).toBeDefined()
      }
    })

    it('should require permissions:list permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission) => {
        return (handler: any) => {
          return async (request: NextRequest) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer limited_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })

    it('should handle empty results', async () => {
      // Clean all permissions
      await prisma.apiPermission.deleteMany({})
      await prisma.menuPermission.deleteMany({})
      await prisma.dataPermission.deleteMany({})
      await prisma.permission.deleteMany({})

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toEqual([])
      expect(data.pagination.totalItems).toBe(0)
    })

    it('should validate pagination parameters', async () => {
      const url = new URL('http://localhost:3000/api/v2/permissions')
      url.searchParams.set('page', '0') // Invalid page
      url.searchParams.set('pageSize', '1000') // Exceeds max

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Should use corrected values
      expect(data.pagination.page).toBe(1) // Corrected from 0
      expect(data.pagination.pageSize).toBeLessThanOrEqual(100) // Capped at max
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in POST request', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('Invalid JSON')
    })

    it('should handle database connection errors', async () => {
      // Mock database error
      const originalCreate = prisma.permission.create
      prisma.permission.create = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const permissionData = {
        name: 'db:test',
        displayName: 'DB Test Permission',
        type: PermissionType.API,
        resource: '/api/dbtest',
        action: 'read',
        apiDetails: {
          httpMethod: HttpMethod.GET,
          endpoint: '/api/dbtest'
        }
      }

      const request = new NextRequest('http://localhost:3000/api/v2/permissions', {
        method: 'POST',
        body: JSON.stringify(permissionData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('error occurred')

      // Restore original method
      prisma.permission.create = originalCreate
    })
  })
})