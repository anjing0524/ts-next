// __tests__/api/v2/roles/route.test.ts

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/v2/roles/route'
import { prisma } from '@/lib/prisma'

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
          permissions: ['roles:create', 'roles:list', 'roles:read', 'roles:update', 'roles:delete']
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
        
        return handler(request)
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

describe('/api/v2/roles', () => {
  let testRole1: any
  let testRole2: any
  let testPermission1: any
  let testPermission2: any
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

    // Create test roles
    testRole1 = await prisma.role.create({
      data: {
        name: 'test_role_1',
        displayName: 'Test Role 1',
        description: 'First test role',
        isActive: true
      }
    })

    testRole2 = await prisma.role.create({
      data: {
        name: 'test_role_2',
        displayName: 'Test Role 2',
        description: 'Second test role',
        isActive: false
      }
    })

    // Assign permissions to test role 1
    await prisma.rolePermission.createMany({
      data: [
        { roleId: testRole1.id, permissionId: testPermission1.id },
        { roleId: testRole1.id, permissionId: testPermission2.id }
      ]
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('GET /api/v2/roles (List Roles)', () => {
    it('should list all roles with default pagination', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(2)
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 2,
        totalPages: 1
      })

      // Check role structure with permissions
      const role1 = data.data.find((r: any) => r.name === 'test_role_1')
      expect(role1).toBeDefined()
      expect(role1.permissions).toHaveLength(2)
      expect(role1.permissions.map((p: any) => p.name)).toContain('test:read')
      expect(role1.permissions.map((p: any) => p.name)).toContain('test:write')
    })

    it('should support pagination parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles?page=1&pageSize=1', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(1)
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2
      })
    })

    it('should filter roles by name', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles?name=test_role_1', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].name).toBe('test_role_1')
    })

    it('should filter roles by active status', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles?isActive=true', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(1)
      expect(data.data[0].isActive).toBe(true)
      expect(data.data[0].name).toBe('test_role_1')
    })

    it('should return empty results when no roles match filter', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles?name=nonexistent', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(0)
      expect(data.pagination.totalItems).toBe(0)
    })

    it('should enforce maximum page size', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles?pageSize=200', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.pagination.pageSize).toBe(100) // Should be capped at MAX_PAGE_SIZE
    })

    it('should require roles:list permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission: string) => {
        return (handler: any) => {
          return async (request: NextRequest) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
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
  })

  describe('POST /api/v2/roles (Create Role)', () => {
    it('should create a new role successfully', async () => {
      const roleData = {
        name: 'new_test_role',
        displayName: 'New Test Role',
        description: 'A newly created test role',
        isActive: true
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.name).toBe('new_test_role')
      expect(data.displayName).toBe('New Test Role')
      expect(data.description).toBe('A newly created test role')
      expect(data.isActive).toBe(true)
      expect(data.permissions).toEqual([])

      // Verify in database
      const createdRole = await prisma.role.findUnique({
        where: { name: 'new_test_role' }
      })
      expect(createdRole).toBeTruthy()
      expect(createdRole?.displayName).toBe('New Test Role')
    })

    it('should create a role with permissions', async () => {
      const roleData = {
        name: 'role_with_permissions',
        displayName: 'Role With Permissions',
        description: 'A role with assigned permissions',
        isActive: true,
        permissionIds: [testPermission1.id, testPermission2.id]
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.name).toBe('role_with_permissions')
      expect(data.permissions).toHaveLength(2)
      expect(data.permissions.map((p: any) => p.name)).toContain('test:read')
      expect(data.permissions.map((p: any) => p.name)).toContain('test:write')

      // Verify role permissions in database
      const rolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: data.id }
      })
      expect(rolePermissions).toHaveLength(2)
    })

    it('should use default values for optional fields', async () => {
      const roleData = {
        name: 'minimal_role',
        displayName: 'Minimal Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.isActive).toBe(true) // Default value
      expect(data.description).toBeNull()
      expect(data.permissions).toEqual([]) // Default empty array
    })

    it('should validate required fields', async () => {
      const invalidRoleData = {
        displayName: 'Role Without Name'
        // Missing required 'name' field
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(invalidRoleData),
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

    it('should validate role name format', async () => {
      const invalidRoleData = {
        name: 'invalid role name!', // Contains spaces and special characters
        displayName: 'Invalid Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(invalidRoleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('validation failed')
      expect(data.errors.name).toBeDefined()
    })

    it('should validate role name length', async () => {
      const invalidRoleData = {
        name: 'ab', // Too short (less than 3 characters)
        displayName: 'Short Name Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(invalidRoleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('validation failed')
      expect(data.errors.name).toBeDefined()
    })

    it('should prevent duplicate role names', async () => {
      const duplicateRoleData = {
        name: 'test_role_1', // Already exists
        displayName: 'Duplicate Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(duplicateRoleData),
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

    it('should validate permission IDs', async () => {
      const roleData = {
        name: 'role_with_invalid_permissions',
        displayName: 'Role With Invalid Permissions',
        permissionIds: ['invalid_permission_id', 'another_invalid_id']
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.message).toContain('Invalid or non-existent permissionIds')
    })

    it('should handle malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
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

    it('should require roles:create permission', async () => {
      // Mock insufficient permissions
      const { requirePermission } = require('@/lib/auth/middleware')
      requirePermission.mockImplementation((permission: string) => {
        return (handler: any) => {
          return async (request: NextRequest) => {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      })

      const roleData = {
        name: 'unauthorized_role',
        displayName: 'Unauthorized Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
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
  })

  describe('Error Handling', () => {
    it('should handle database connection errors in GET', async () => {
      // Mock database error
      const originalFindMany = prisma.role.findMany
      prisma.role.findMany = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('Failed to retrieve roles list')

      // Restore original method
      prisma.role.findMany = originalFindMany
    })

    it('should handle database connection errors in POST', async () => {
      // Mock database error
      const originalFindUnique = prisma.role.findUnique
      prisma.role.findUnique = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const roleData = {
        name: 'error_test_role',
        displayName: 'Error Test Role'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/roles', {
        method: 'POST',
        body: JSON.stringify(roleData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.message).toContain('server error occurred')

      // Restore original method
      prisma.role.findUnique = originalFindUnique
    })
  })
})