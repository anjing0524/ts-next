// __tests__/api/v2/roles/[roleId]/route.test.ts

import { NextRequest } from 'next/server'
import { GET, PATCH, DELETE } from '@/app/api/v2/roles/[roleId]/route'
import { prisma } from '@/lib/prisma'

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
          permissions: ['roles:read', 'roles:update', 'roles:delete']
        }
        
        // Check if user has required permission
        if (permission && !mockContext.permissions.includes(permission)) {
          return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          })
        }
        
        // Add user context to request
        ;(request as any).user = mockContext.user
        
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

describe('/api/v2/roles/[roleId]', () => {
  let testRole: any
  let testPermission1: any
  let testPermission2: any
  let adminUser: any
  let regularUser: any

  beforeEach(async () => {
    // Clean up test data
    await global.testUtils.cleanupTestData()

    // Create admin user
    adminUser = await global.testUtils.createTestUser({
      username: 'admin',
      email: 'admin@example.com',
      roles: ['admin']
    })

    // Create regular user
    regularUser = await global.testUtils.createTestUser({
      username: 'regular',
      email: 'regular@example.com',
      roles: ['user']
    })

    // Create test permissions
    testPermission1 = await prisma.permission.create({
      data: {
        name: 'test:read',
        displayName: 'Test Read Permission',
        description: 'Permission to read test resources',
        type: 'API',
        resource: '/api/test',
        action: 'read',
        isActive: true
      }
    })

    testPermission2 = await prisma.permission.create({
      data: {
        name: 'test:write',
        displayName: 'Test Write Permission',
        description: 'Permission to write test resources',
        type: 'API',
        resource: '/api/test',
        action: 'write',
        isActive: true
      }
    })

    // Create test role with permissions
    testRole = await prisma.role.create({
      data: {
        name: 'test_role',
        displayName: 'Test Role',
        description: 'A test role for unit testing',
        isActive: true
      }
    })

    // Assign permissions to test role
    await prisma.rolePermission.createMany({
      data: [
        { roleId: testRole.id, permissionId: testPermission1.id },
        { roleId: testRole.id, permissionId: testPermission2.id }
      ]
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('GET /api/v2/roles/[roleId] (Get Role Details)', () => {
    it('should get role details with permissions', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe(testRole.id)
      expect(data.name).toBe('test_role')
      expect(data.displayName).toBe('Test Role')
      expect(data.description).toBe('A test role for unit testing')
      expect(data.isActive).toBe(true)
      expect(data.permissions).toHaveLength(2)
      expect(data.permissions.map((p: any) => p.name)).toContain('test:read')
      expect(data.permissions.map((p: any) => p.name)).toContain('test:write')
    })

    it('should return 404 for non-existent role', async () => {
      const nonExistentId = 'non-existent-role-id'
      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${nonExistentId}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: nonExistentId } }
      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('Role not found')
    })

    it('should require roles:read permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission: string) => {
        return (handler: any) => {
          return async (request: NextRequest, context: any) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('PUT /api/v2/roles/[roleId] (Update Role)', () => {
    it('should update role display name successfully', async () => {
      const updateData = {
        displayName: 'Updated Test Role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.displayName).toBe('Updated Test Role')
      expect(data.name).toBe('test_role') // Name should remain unchanged
      expect(data.description).toBe('A test role for unit testing') // Other fields unchanged

      // Verify in database
      const updatedRole = await prisma.role.findUnique({
        where: { id: testRole.id }
      })
      expect(updatedRole?.displayName).toBe('Updated Test Role')
    })

    it('should update role description successfully', async () => {
      const updateData = {
        description: 'Updated description for test role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.description).toBe('Updated description for test role')
    })

    it('should update role active status successfully', async () => {
      const updateData = {
        isActive: false
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.isActive).toBe(false)

      // Verify in database
      const updatedRole = await prisma.role.findUnique({
        where: { id: testRole.id }
      })
      expect(updatedRole?.isActive).toBe(false)
    })

    it('should update multiple fields at once', async () => {
      const updateData = {
        displayName: 'Multi-Updated Role',
        description: 'Updated with multiple fields',
        isActive: false
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.displayName).toBe('Multi-Updated Role')
      expect(data.description).toBe('Updated with multiple fields')
      expect(data.isActive).toBe(false)
    })

    it('should allow setting description to null', async () => {
      const updateData = {
        description: null
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.description).toBeNull()
    })

    it('should return 404 for non-existent role', async () => {
      const nonExistentId = 'non-existent-role-id'
      const updateData = {
        displayName: 'Updated Role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${nonExistentId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: nonExistentId } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('Role not found')
    })

    it('should prevent modifying role name', async () => {
      const updateData = {
        name: 'new_role_name',
        displayName: 'Updated Role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('Modifying the role name is not allowed')
    })

    it('should prevent deactivating SYSTEM_ADMIN role', async () => {
      // Create SYSTEM_ADMIN role
      const systemAdminRole = await prisma.role.create({
        data: {
          name: 'SYSTEM_ADMIN',
          displayName: 'System Administrator',
          description: 'System administrator role',
          isActive: true
        }
      })

      const updateData = {
        isActive: false
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${systemAdminRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: systemAdminRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.message).toContain('Cannot deactivate the SYSTEM_ADMIN role')
    })

    it('should validate request body', async () => {
      const invalidUpdateData = {
        displayName: '', // Empty string should fail validation
        isActive: 'invalid' // Should be boolean
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(invalidUpdateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('validation failed')
      expect(data.errors).toBeDefined()
    })

    it('should require at least one field to update', async () => {
      const emptyUpdateData = {}

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(emptyUpdateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('At least one field to update is required')
    })

    it('should handle malformed JSON', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('Invalid JSON')
    })

    it('should require roles:update permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission: string) => {
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
        displayName: 'Updated Role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('DELETE /api/v2/roles/[roleId] (Delete Role)', () => {
    it('should delete role successfully', async () => {
      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await DELETE(request, context)

      expect(response.status).toBe(204)

      // Verify role is deleted from database
      const deletedRole = await prisma.role.findUnique({
        where: { id: testRole.id }
      })
      expect(deletedRole).toBeNull()

      // Verify role permissions are also deleted (cascade)
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: testRole.id }
      })
      expect(rolePermissions).toHaveLength(0)
    })

    it('should return 404 for non-existent role', async () => {
      const nonExistentId = 'non-existent-role-id'
      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${nonExistentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: nonExistentId } }
      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toContain('Role not found')
    })

    it('should prevent deleting core system roles', async () => {
      // Create SYSTEM_ADMIN role
      const systemAdminRole = await prisma.role.create({
        data: {
          name: 'SYSTEM_ADMIN',
          displayName: 'System Administrator',
          description: 'System administrator role',
          isActive: true
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${systemAdminRole.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: systemAdminRole.id } }
      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.message).toContain('Core system role')
      expect(data.message).toContain('cannot be deleted')

      // Verify role still exists
      const stillExistsRole = await prisma.role.findUnique({
        where: { id: systemAdminRole.id }
      })
      expect(stillExistsRole).toBeTruthy()
    })

    it('should prevent deleting role assigned to users', async () => {
      // Assign test role to regular user
      await prisma.userRole.create({
        data: {
          userId: regularUser.id,
          roleId: testRole.id
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.message).toContain('still in use')
      expect(data.message).toContain('1 users')

      // Verify role still exists
      const stillExistsRole = await prisma.role.findUnique({
        where: { id: testRole.id }
      })
      expect(stillExistsRole).toBeTruthy()
    })

    it('should require roles:delete permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission: string) => {
        return (handler: any) => {
          return async (request: NextRequest, context: any) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer limited_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors in GET', async () => {
      // Mock database error
      const originalFindUnique = prisma.role.findUnique
      prisma.role.findUnique = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await GET(request, context)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('error occurred while retrieving role details')

      // Restore original method
      prisma.role.findUnique = originalFindUnique
    })

    it('should handle database connection errors in PUT', async () => {
      // Mock database error
      const originalFindUnique = prisma.role.findUnique
      prisma.role.findUnique = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const updateData = {
        displayName: 'Updated Role'
      }

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await PUT(request, context)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('error occurred while updating role')

      // Restore original method
      prisma.role.findUnique = originalFindUnique
    })

    it('should handle database connection errors in DELETE', async () => {
      // Mock database error
      const originalFindUnique = prisma.role.findUnique
      prisma.role.findUnique = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest(`http://localhost:3000/api/v2/roles/${testRole.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const context = { params: { roleId: testRole.id } }
      const response = await DELETE(request, context)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('error occurred while deleting role')

      // Restore original method
      prisma.role.findUnique = originalFindUnique
    })
  })
})