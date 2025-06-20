// __tests__/api/v2/permissions/[permissionId]/route.test.ts

import { NextRequest } from 'next/server'
import { GET, PUT, DELETE } from '@/app/api/v2/permissions/[permissionId]/route'
import { prisma } from '@/lib/prisma'
import { PermissionType, HttpMethod } from '@prisma/client'

// Mock the authentication middleware
jest.mock('@/lib/auth/middleware', () => ({
  requirePermission: jest.fn().mockImplementation((permission) => {
    return (handler: any) => {
      return async (request: NextRequest, context: any) => {
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
        
        return handler(request, context)
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

describe('/api/v2/permissions/[permissionId]', () => {
  let testApiPermission: any
  let testMenuPermission: any
  let testDataPermission: any
  let testMenu: any
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

    // Create test menu
    testMenu = await prisma.menu.create({
      data: {
        key: 'test_menu',
        name: 'Test Menu',
        path: '/test',
        icon: 'test-icon',
        sortOrder: 1
      }
    })

    // Create test API permission
    testApiPermission = await prisma.permission.create({
      data: {
        name: 'test:api_read',
        displayName: 'Test API Read Permission',
        description: 'Permission to read test API resources',
        type: PermissionType.API,
        resource: '/api/test',
        action: 'read',
        isActive: true
      }
    })

    await prisma.apiPermission.create({
      data: {
        permissionId: testApiPermission.id,
        httpMethod: HttpMethod.GET,
        endpoint: '/api/test',
        rateLimit: 100
      }
    })

    // Create test MENU permission
    testMenuPermission = await prisma.permission.create({
      data: {
        name: 'test:menu_access',
        displayName: 'Test Menu Access Permission',
        description: 'Permission to access test menu',
        type: PermissionType.MENU,
        resource: 'test_menu',
        action: 'access',
        isActive: true
      }
    })

    await prisma.menuPermission.create({
      data: {
        permissionId: testMenuPermission.id,
        menuId: testMenu.id
      }
    })

    // Create test DATA permission
    testDataPermission = await prisma.permission.create({
      data: {
        name: 'test:data_read',
        displayName: 'Test Data Read Permission',
        description: 'Permission to read test data',
        type: PermissionType.DATA,
        resource: 'test_table',
        action: 'read',
        isActive: true
      }
    })

    await prisma.dataPermission.create({
      data: {
        permissionId: testDataPermission.id,
        tableName: 'test_table',
        columnName: 'test_column',
        conditions: JSON.stringify({ isActive: true })
      }
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('GET /api/v2/permissions/[permissionId] (Get Permission Details)', () => {
    it('should get API permission details successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe(testApiPermission.id)
      expect(data.name).toBe('test:api_read')
      expect(data.displayName).toBe('Test API Read Permission')
      expect(data.type).toBe(PermissionType.API)
      expect(data.apiPermission).toBeDefined()
      expect(data.apiPermission.httpMethod).toBe(HttpMethod.GET)
      expect(data.apiPermission.endpoint).toBe('/api/test')
      expect(data.apiPermission.rateLimit).toBe(100)
    })

    it('should get MENU permission details successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testMenuPermission.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testMenuPermission.id }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe(testMenuPermission.id)
      expect(data.type).toBe(PermissionType.MENU)
      expect(data.menuPermission).toBeDefined()
      expect(data.menuPermission.menuId).toBe(testMenu.id)
      expect(data.menuPermission.menu).toBeDefined()
      expect(data.menuPermission.menu.key).toBe('test_menu')
    })

    it('should get DATA permission details successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testDataPermission.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testDataPermission.id }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe(testDataPermission.id)
      expect(data.type).toBe(PermissionType.DATA)
      expect(data.dataPermission).toBeDefined()
      expect(data.dataPermission.tableName).toBe('test_table')
      expect(data.dataPermission.columnName).toBe('test_column')
      expect(data.dataPermission.conditions).toBe(JSON.stringify({ isActive: true }))
    })

    it('should return 404 for non-existent permission', async () => {
      const nonExistentId = 'non_existent_id'
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${nonExistentId}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: nonExistentId }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('not found')
    })

    it('should require permissions:read permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission) => {
        return (handler: any) => {
          return async (request: NextRequest, context: any) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('PUT /api/v2/permissions/[permissionId] (Update Permission)', () => {
    it('should update API permission successfully', async () => {
      const updateData = {
        displayName: 'Updated API Permission',
        description: 'Updated description for API permission',
        resource: '/api/updated',
        action: 'write',
        isActive: false,
        apiDetails: {
          httpMethod: HttpMethod.POST,
          endpoint: '/api/updated',
          rateLimit: 200
        }
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.permission.displayName).toBe('Updated API Permission')
      expect(data.permission.description).toBe('Updated description for API permission')
      expect(data.permission.resource).toBe('/api/updated')
      expect(data.permission.action).toBe('write')
      expect(data.permission.isActive).toBe(false)
      expect(data.permission.apiPermission.httpMethod).toBe(HttpMethod.POST)
      expect(data.permission.apiPermission.endpoint).toBe('/api/updated')
      expect(data.permission.apiPermission.rateLimit).toBe(200)

      // Verify in database
      const updatedPermission = await prisma.permission.findUnique({
        where: { id: testApiPermission.id },
        include: { apiPermission: true }
      })
      expect(updatedPermission?.displayName).toBe('Updated API Permission')
      expect(updatedPermission?.apiPermission?.rateLimit).toBe(200)
    })

    it('should update MENU permission successfully', async () => {
      // Create another menu for testing
      const newMenu = await prisma.menu.create({
        data: {
          key: 'new_test_menu',
          name: 'New Test Menu',
          path: '/new-test',
          icon: 'new-test-icon',
          sortOrder: 2
        }
      })

      const updateData = {
        displayName: 'Updated Menu Permission',
        menuDetails: {
          menuId: newMenu.id
        }
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testMenuPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testMenuPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.permission.displayName).toBe('Updated Menu Permission')
      expect(data.permission.menuPermission.menuId).toBe(newMenu.id)
    })

    it('should update DATA permission successfully', async () => {
      const updateData = {
        displayName: 'Updated Data Permission',
        dataDetails: {
          tableName: 'updated_table',
          columnName: 'updated_column',
          conditions: JSON.stringify({ status: 'active' })
        }
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testDataPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testDataPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.permission.displayName).toBe('Updated Data Permission')
      expect(data.permission.dataPermission.tableName).toBe('updated_table')
      expect(data.permission.dataPermission.columnName).toBe('updated_column')
      expect(data.permission.dataPermission.conditions).toBe(JSON.stringify({ status: 'active' }))
    })

    it('should return 404 for non-existent permission', async () => {
      const nonExistentId = 'non_existent_id'
      const updateData = {
        displayName: 'Updated Permission'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${nonExistentId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: nonExistentId }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('not found')
    })

    it('should validate update data', async () => {
      const invalidUpdateData = {
        displayName: '', // Empty display name
        resource: '', // Empty resource
        apiDetails: {
          endpoint: 'invalid-endpoint' // Should start with '/'
        }
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify(invalidUpdateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('validation failed')
      expect(data.errors).toBeDefined()
    })

    it('should handle empty update body', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('empty')
    })

    it('should require permissions:update permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission) => {
        return (handler: any) => {
          return async (request: NextRequest, context: any) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const updateData = {
        displayName: 'Updated Permission'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('DELETE /api/v2/permissions/[permissionId] (Delete Permission)', () => {
    it('should delete API permission successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('deleted successfully')

      // Verify permission was deleted from database
      const deletedPermission = await prisma.permission.findUnique({
        where: { id: testApiPermission.id }
      })
      expect(deletedPermission).toBeNull()

      // Verify associated API permission details were also deleted
      const deletedApiPermission = await prisma.apiPermission.findFirst({
        where: { permissionId: testApiPermission.id }
      })
      expect(deletedApiPermission).toBeNull()
    })

    it('should delete MENU permission successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testMenuPermission.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testMenuPermission.id }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('deleted successfully')

      // Verify permission was deleted
      const deletedPermission = await prisma.permission.findUnique({
        where: { id: testMenuPermission.id }
      })
      expect(deletedPermission).toBeNull()

      // Verify associated menu permission details were also deleted
      const deletedMenuPermission = await prisma.menuPermission.findFirst({
        where: { permissionId: testMenuPermission.id }
      })
      expect(deletedMenuPermission).toBeNull()
    })

    it('should delete DATA permission successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testDataPermission.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testDataPermission.id }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toContain('deleted successfully')

      // Verify permission was deleted
      const deletedPermission = await prisma.permission.findUnique({
        where: { id: testDataPermission.id }
      })
      expect(deletedPermission).toBeNull()

      // Verify associated data permission details were also deleted
      const deletedDataPermission = await prisma.dataPermission.findFirst({
        where: { permissionId: testDataPermission.id }
      })
      expect(deletedDataPermission).toBeNull()
    })

    it('should return 404 for non-existent permission', async () => {
      const nonExistentId = 'non_existent_id'
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${nonExistentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: nonExistentId }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('not found')
    })

    it('should handle permission in use by roles', async () => {
      // Create a role and assign the permission to it
      const role = await prisma.role.create({
        data: {
          name: 'test_role',
          description: 'Test role with permission'
        }
      })

      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: testApiPermission.id
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.message).toContain('in use')
    })

    it('should require permissions:delete permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission) => {
        return (handler: any) => {
          return async (request: NextRequest, context: any) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in PUT request', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'PUT',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('Invalid JSON')
    })

    it('should handle database connection errors', async () => {
      // Mock database error
      const originalFindUnique = prisma.permission.findUnique
      prisma.permission.findUnique = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest(`http://localhost:3000/api/v2/permissions/${testApiPermission.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = {
        params: { permissionId: testApiPermission.id }
      }

      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('error occurred')

      // Restore original method
      prisma.permission.findUnique = originalFindUnique
    })
  })
})