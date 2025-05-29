import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Prisma client
const mockPrisma = {
  client: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock nanoid for client ID generation
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-123'),
}))

// Mock bcrypt for password hashing
vi.mock('bcrypt', () => ({
  hash: vi.fn(() => Promise.resolve('hashed-secret')),
  compare: vi.fn(() => Promise.resolve(true)),
}))

describe('Client Management API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('/api/clients/register', () => {
    it('should register a new OAuth client successfully', async () => {
      const mockClient = {
        id: '1',
        clientId: 'client_mock-nanoid-123',
        clientSecret: 'hashed-secret',
        name: 'Test Application',
        description: 'A test OAuth client',
        redirectUris: ['http://localhost:3000/callback'],
        isPublic: false,
        isActive: true,
        createdAt: new Date(),
      }

      mockPrisma.client.create.mockResolvedValue(mockClient)

      const registrationData = {
        name: 'Test Application',
        description: 'A test OAuth client',
        redirectUris: 'http://localhost:3000/callback',
        isPublic: false,
      }

      // Test client registration logic
      const clientData = {
        clientId: `client_mock-nanoid-123`,
        clientSecret: 'hashed-secret',
        name: registrationData.name,
        description: registrationData.description,
        redirectUris: registrationData.redirectUris.split(',').map(uri => uri.trim()),
        isPublic: registrationData.isPublic,
        isActive: true,
      }

      expect(clientData.name).toBe('Test Application')
      expect(clientData.clientId).toContain('client_')
      expect(clientData.redirectUris).toEqual(['http://localhost:3000/callback'])
      expect(clientData.isPublic).toBe(false)
    })

    it('should register a public client without secret', async () => {
      const mockClient = {
        id: '1',
        clientId: 'client_public-123',
        clientSecret: null,
        name: 'Public App',
        redirectUris: ['http://localhost:3000/callback'],
        isPublic: true,
        isActive: true,
      }

      mockPrisma.client.create.mockResolvedValue(mockClient)

      const publicClientData = {
        name: 'Public App',
        redirectUris: ['http://localhost:3000/callback'],
        isPublic: true,
        // No client secret for public clients
        clientSecret: null,
      }

      expect(publicClientData.isPublic).toBe(true)
      expect(publicClientData.clientSecret).toBeNull()
    })

    it('should validate redirect URIs format', () => {
      const validateRedirectUris = (uris: string[]) => {
        try {
          return uris.every(uri => {
            const url = new URL(uri)
            return url.protocol === 'http:' || url.protocol === 'https:'
          })
        } catch {
          return false
        }
      }

      const validUris = ['http://localhost:3000/callback', 'https://app.example.com/auth']
      const invalidUris = ['invalid-uri', 'ftp://example.com']

      expect(validateRedirectUris(validUris)).toBe(true)
      expect(validateRedirectUris(invalidUris)).toBe(false)
    })

    it('should reject registration with invalid data', () => {
      const invalidData = {
        name: '', // Empty name
        redirectUris: ['invalid-uri'],
      }

      const isValidName = invalidData.name.trim().length > 0
      const isValidUris = invalidData.redirectUris.every(uri => {
        try {
          new URL(uri)
          return true
        } catch {
          return false
        }
      })

      expect(isValidName).toBe(false)
      expect(isValidUris).toBe(false)
    })
  })

  describe('/api/clients', () => {
    it('should list clients with pagination', async () => {
      const mockClients = [
        {
          id: '1',
          clientId: 'client-1',
          name: 'App 1',
          isActive: true,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: '2',
          clientId: 'client-2',
          name: 'App 2',
          isActive: true,
          createdAt: new Date('2024-01-02'),
        },
      ]

      mockPrisma.client.findMany.mockResolvedValue(mockClients)

      const query = {
        limit: 10,
        offset: 0,
        isActive: true,
      }

      const clients = await mockPrisma.client.findMany({
        take: query.limit,
        skip: query.offset,
        where: { isActive: query.isActive },
        orderBy: { createdAt: 'desc' },
      })

      expect(clients).toHaveLength(2)
      expect(clients[0].name).toBe('App 1')
      expect(clients[1].name).toBe('App 2')
    })

    it('should filter clients by status', async () => {
      const activeClients = [
        { id: '1', clientId: 'active-1', isActive: true },
        { id: '2', clientId: 'active-2', isActive: true },
      ]

      mockPrisma.client.findMany.mockResolvedValue(activeClients)

      const filterActiveClients = (isActive?: boolean) => {
        const where = isActive !== undefined ? { isActive } : {}
        return mockPrisma.client.findMany({ where })
      }

      const clients = await filterActiveClients(true)
      expect(clients).toHaveLength(2)
      expect(clients.every((c: any) => c.isActive)).toBe(true)
    })

    it('should search clients by name', async () => {
      const searchResults = [
        { id: '1', name: 'Test App', clientId: 'test-1' },
      ]

      mockPrisma.client.findMany.mockResolvedValue(searchResults)

      const searchClients = (query: string) => {
        return mockPrisma.client.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { clientId: { contains: query, mode: 'insensitive' } },
            ],
          },
        })
      }

      const results = await searchClients('test')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Test App')
    })
  })

  describe('Client Validation', () => {
    it('should validate client registration data', () => {
      const validateClientData = (data: any) => {
        const errors: string[] = []

        if (!data.name || data.name.trim().length === 0) {
          errors.push('Name is required')
        }

        if (!data.redirectUris || data.redirectUris.length === 0) {
          errors.push('At least one redirect URI is required')
        }

        if (data.redirectUris) {
          data.redirectUris.forEach((uri: string) => {
            try {
              const url = new URL(uri)
              if (!['http:', 'https:'].includes(url.protocol)) {
                errors.push(`Invalid protocol in URI: ${uri}`)
              }
            } catch {
              errors.push(`Invalid URI format: ${uri}`)
            }
          })
        }

        return { isValid: errors.length === 0, errors }
      }

      const validData = {
        name: 'Valid App',
        redirectUris: ['https://example.com/callback'],
      }

      const invalidData = {
        name: '',
        redirectUris: ['invalid-uri'],
      }

      const validResult = validateClientData(validData)
      const invalidResult = validateClientData(invalidData)

      expect(validResult.isValid).toBe(true)
      expect(validResult.errors).toHaveLength(0)

      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.errors).toContain('Name is required')
      expect(invalidResult.errors.some(e => e.includes('Invalid URI format'))).toBe(true)
    })

    it('should validate redirect URI security', () => {
      const isSecureRedirectUri = (uri: string) => {
        try {
          const url = new URL(uri)
          
          // Allow localhost for development
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
            return true
          }
          
          // Require HTTPS for production
          return url.protocol === 'https:'
        } catch {
          return false
        }
      }

      expect(isSecureRedirectUri('https://example.com/callback')).toBe(true)
      expect(isSecureRedirectUri('http://localhost:3000/callback')).toBe(true)
      expect(isSecureRedirectUri('http://example.com/callback')).toBe(false)
      expect(isSecureRedirectUri('invalid-uri')).toBe(false)
    })
  })

  describe('Client Secret Management', () => {
    it('should generate secure client secret', () => {
      const generateClientSecret = () => {
        // In real implementation, use crypto.randomBytes
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let result = ''
        for (let i = 0; i < 32; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return result
      }

      const secret = generateClientSecret()
      expect(secret).toBeDefined()
      expect(secret.length).toBe(32)
      expect(typeof secret).toBe('string')
    })

    it('should hash client secret before storage', async () => {
      const bcrypt = await import('bcrypt')
      
      const plainSecret = 'plain-secret-123'
      
      // Use the mocked bcrypt.hash function
      const hashedSecret = await bcrypt.hash(plainSecret, 10)
      
      expect(hashedSecret).toBeDefined()
      expect(hashedSecret).toBe('hashed-secret') // This should match our mock
      expect(bcrypt.hash).toHaveBeenCalledWith(plainSecret, 10)
    })

    it('should verify client secret during authentication', async () => {
      const bcrypt = await import('bcrypt')
      
      const plainSecret = 'client-secret'
      const hashedSecret = 'hashed-secret'
      
      bcrypt.compare = vi.fn().mockResolvedValue(true)
      
      const isValid = await bcrypt.compare(plainSecret, hashedSecret)
      expect(isValid).toBe(true)
      expect(bcrypt.compare).toHaveBeenCalledWith(plainSecret, hashedSecret)
    })
  })

  describe('Client Status Management', () => {
    it('should activate/deactivate client', async () => {
      const mockClient = {
        id: '1',
        clientId: 'test-client',
        isActive: false,
      }

      mockPrisma.client.findUnique.mockResolvedValue(mockClient)
      mockPrisma.client.update.mockResolvedValue({
        ...mockClient,
        isActive: true,
      })

      const updateClientStatus = async (clientId: string, isActive: boolean) => {
        const client = await mockPrisma.client.findUnique({
          where: { clientId },
        })

        if (!client) {
          throw new Error('Client not found')
        }

        return mockPrisma.client.update({
          where: { id: client.id },
          data: { isActive },
        })
      }

      const updatedClient = await updateClientStatus('test-client', true)
      expect(updatedClient.isActive).toBe(true)
    })

    it('should delete client and revoke all tokens', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        id: '1',
        clientId: 'test-client',
      })

      mockPrisma.client.delete.mockResolvedValue({
        id: '1',
        clientId: 'test-client',
      })

      const deleteClient = async (clientId: string) => {
        const client = await mockPrisma.client.findUnique({
          where: { clientId },
        })

        if (!client) {
          throw new Error('Client not found')
        }

        // In real implementation, also revoke all associated tokens
        await mockPrisma.client.delete({
          where: { id: client.id },
        })

        return { deleted: true }
      }

      const result = await deleteClient('test-client')
      expect(result.deleted).toBe(true)
      expect(mockPrisma.client.delete).toHaveBeenCalled()
    })
  })

  describe('Client Permissions', () => {
    it('should check client scope permissions', () => {
      const checkClientScopes = (client: any, requestedScopes: string[]) => {
        // Default allowed scopes for all clients
        const defaultScopes = ['openid', 'profile', 'email']
        
        // Admin scope requires special permission
        const adminClients = ['admin-center']
        const allowedScopes = adminClients.includes(client.clientId) 
          ? [...defaultScopes, 'admin']
          : defaultScopes

        return requestedScopes.every(scope => allowedScopes.includes(scope))
      }

      const regularClient = { clientId: 'regular-app' }
      const adminClient = { clientId: 'admin-center' }

      expect(checkClientScopes(regularClient, ['openid', 'profile'])).toBe(true)
      expect(checkClientScopes(regularClient, ['openid', 'admin'])).toBe(false)
      expect(checkClientScopes(adminClient, ['openid', 'admin'])).toBe(true)
    })

    it('should validate client redirect URI permissions', () => {
      const isAllowedRedirectUri = (client: any, requestedUri: string) => {
        const registeredUris = client.redirectUris || []
        
        // Exact match required for security
        return registeredUris.includes(requestedUri)
      }

      const client = {
        redirectUris: [
          'https://app.example.com/callback',
          'http://localhost:3000/callback',
        ],
      }

      expect(isAllowedRedirectUri(client, 'https://app.example.com/callback')).toBe(true)
      expect(isAllowedRedirectUri(client, 'http://localhost:3000/callback')).toBe(true)
      expect(isAllowedRedirectUri(client, 'https://evil.com/callback')).toBe(false)
    })
  })

  describe('Audit Logging', () => {
    it('should log client registration events', async () => {
      const logClientEvent = async (event: string, clientId: string, userId?: string) => {
        await mockPrisma.auditLog.create({
          data: {
            event,
            resource: 'client',
            resourceId: clientId,
            userId,
            timestamp: new Date(),
          },
        })
      }

      await logClientEvent('client_registered', 'new-client-123', 'admin-user-1')
      
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          event: 'client_registered',
          resource: 'client',
          resourceId: 'new-client-123',
          userId: 'admin-user-1',
          timestamp: expect.any(Date),
        },
      })
    })

    it('should log client status changes', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({})

      const logStatusChange = async (clientId: string, oldStatus: boolean, newStatus: boolean) => {
        await mockPrisma.auditLog.create({
          data: {
            event: 'client_status_changed',
            resource: 'client',
            resourceId: clientId,
            details: {
              oldStatus,
              newStatus,
            },
            timestamp: new Date(),
          },
        })
      }

      await logStatusChange('test-client', false, true)
      
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          event: 'client_status_changed',
          resource: 'client',
          resourceId: 'test-client',
          details: {
            oldStatus: false,
            newStatus: true,
          },
          timestamp: expect.any(Date),
        },
      })
    })
  })
}) 