// __tests__/api/v2/users/route.test.ts

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/v2/users/route'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'

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
          permissions: ['users:create', 'users:list', 'users:read', 'users:update', 'users:delete']
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

// Mock the error handling wrapper
jest.mock('@/lib/errors', () => ({
  withErrorHandling: jest.fn().mockImplementation((handler) => handler),
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ValidationError'
    }
  },
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthenticationError'
    }
  }
}))

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}))

describe('/api/v2/users', () => {
  let testUser: any
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

    // Create test user
    testUser = await global.testUtils.createTestUser({
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('POST /api/v2/users (Create User)', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'New',
        lastName: 'User',
        roles: ['user']
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.user).toBeDefined()
      expect(data.user.username).toBe('newuser')
      expect(data.user.email).toBe('newuser@example.com')
      expect(data.user.firstName).toBe('New')
      expect(data.user.lastName).toBe('User')
      expect(data.user).not.toHaveProperty('password')
      expect(data.user).not.toHaveProperty('passwordHash')

      // Verify user was created in database
      const createdUser = await prisma.user.findUnique({
        where: { username: 'newuser' }
      })
      expect(createdUser).toBeTruthy()
      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePassword123!', 12)
    })

    it('should validate required fields', async () => {
      const invalidUserData = {
        email: 'invalid@example.com'
        // Missing username and password
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(invalidUserData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('validation_error')
      expect(data.details).toContain('username')
      expect(data.details).toContain('password')
    })

    it('should validate email format', async () => {
      const userData = {
        username: 'testuser2',
        email: 'invalid-email',
        password: 'SecurePassword123!'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('validation_error')
      expect(data.details).toContain('email')
    })

    it('should validate password strength', async () => {
      const userData = {
        username: 'testuser3',
        email: 'test3@example.com',
        password: 'weak' // Too weak password
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('validation_error')
      expect(data.details).toContain('password')
    })

    it('should prevent duplicate usernames', async () => {
      const userData = {
        username: testUser.username, // Use existing username
        email: 'different@example.com',
        password: 'SecurePassword123!'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('conflict')
      expect(data.message).toContain('username')
    })

    it('should prevent duplicate emails', async () => {
      const userData = {
        username: 'differentuser',
        email: testUser.email, // Use existing email
        password: 'SecurePassword123!'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('conflict')
      expect(data.message).toContain('email')
    })

    it('should require users:create permission', async () => {
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

      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePassword123!'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
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
      const userData = {
        username: 'minimaluser',
        email: 'minimal@example.com',
        password: 'SecurePassword123!'
        // No firstName, lastName, or roles
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.user.isActive).toBe(true)
      expect(data.user.emailVerified).toBe(false)
      expect(data.user.roles).toEqual([])
    })

    it('should handle role assignment', async () => {
      // Create test roles
      const userRole = await prisma.role.create({
        data: {
          name: 'user',
          description: 'Standard user role'
        }
      })

      const userData = {
        username: 'roleuser',
        email: 'roleuser@example.com',
        password: 'SecurePassword123!',
        roles: ['user']
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.user.roles).toContain('user')

      // Verify role assignment in database
      const userWithRoles = await prisma.user.findUnique({
        where: { username: 'roleuser' },
        include: { roles: true }
      })
      expect(userWithRoles?.roles).toHaveLength(1)
      expect(userWithRoles?.roles[0].name).toBe('user')
    })
  })

  describe('GET /api/v2/users (List Users)', () => {
    beforeEach(async () => {
      // Create additional test users for pagination testing
      for (let i = 1; i <= 15; i++) {
        await global.testUtils.createTestUser({
          username: `user${i}`,
          email: `user${i}@example.com`,
          firstName: `User`,
          lastName: `${i}`
        })
      }
    })

    it('should list users with default pagination', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toBeDefined()
      expect(data.pagination).toBeDefined()
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.limit).toBe(10)
      expect(data.pagination.total).toBeGreaterThan(15)
      expect(data.users).toHaveLength(10) // Default page size
    })

    it('should support custom pagination', async () => {
      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('page', '2')
      url.searchParams.set('limit', '5')

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
      expect(data.pagination.limit).toBe(5)
      expect(data.users).toHaveLength(5)
    })

    it('should support search by username', async () => {
      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('search', 'user1')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users.length).toBeGreaterThan(0)
      expect(data.users.every((user: any) => 
        user.username.includes('user1') || 
        user.email.includes('user1') ||
        user.firstName?.includes('User') ||
        user.lastName?.includes('1')
      )).toBe(true)
    })

    it('should support search by email', async () => {
      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('search', 'user5@example.com')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users.length).toBe(1)
      expect(data.users[0].email).toBe('user5@example.com')
    })

    it('should support filtering by active status', async () => {
      // Deactivate some users
      await prisma.user.updateMany({
        where: { username: { in: ['user1', 'user2'] } },
        data: { isActive: false }
      })

      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('isActive', 'false')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users.every((user: any) => user.isActive === false)).toBe(true)
    })

    it('should support sorting', async () => {
      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('sortBy', 'username')
      url.searchParams.set('sortOrder', 'desc')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users.length).toBeGreaterThan(1)
      
      // Check if sorted in descending order
      for (let i = 1; i < data.users.length; i++) {
        expect(data.users[i-1].username >= data.users[i].username).toBe(true)
      }
    })

    it('should not include sensitive fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      data.users.forEach((user: any) => {
        expect(user).not.toHaveProperty('password')
        expect(user).not.toHaveProperty('passwordHash')
        expect(user).not.toHaveProperty('passwordSalt')
      })
    })

    it('should require users:list permission', async () => {
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

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
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
      // Clean all users
      await prisma.user.deleteMany({})

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toEqual([])
      expect(data.pagination.total).toBe(0)
    })

    it('should validate pagination parameters', async () => {
      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('page', '-1')
      url.searchParams.set('limit', '1000')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('validation_error')
    })

    it('should include user roles and permissions', async () => {
      // Create role and assign to user
      const role = await prisma.role.create({
        data: {
          name: 'test_role',
          description: 'Test role'
        }
      })

      await prisma.userRole.create({
        data: {
          userId: testUser.id,
          roleId: role.id
        }
      })

      const url = new URL('http://localhost:3000/api/v2/users')
      url.searchParams.set('include', 'roles')

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      const userWithRole = data.users.find((u: any) => u.id === testUser.id)
      expect(userWithRole.roles).toBeDefined()
      expect(userWithRole.roles).toContain('test_role')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in POST request', async () => {
      const request = new NextRequest('http://localhost:3000/api/v2/users', {
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
      expect(data.error).toBe('invalid_json')
    })

    it('should handle database connection errors', async () => {
      // Mock database error
      const originalCreate = prisma.user.create
      prisma.user.create = jest.fn().mockRejectedValue(new Error('Database connection failed'))

      const userData = {
        username: 'dbtest',
        email: 'dbtest@example.com',
        password: 'SecurePassword123!'
      }

      const request = new NextRequest('http://localhost:3000/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer admin_token'
        }
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('internal_server_error')

      // Restore original method
      prisma.user.create = originalCreate
    })
  })
})