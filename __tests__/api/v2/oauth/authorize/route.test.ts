// __tests__/api/v2/oauth/authorize/route.test.ts

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v2/oauth/authorize/route'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { addHours } from 'date-fns'

// Mock the OAuth2 utils
jest.mock('@/lib/auth/oauth2', () => ({
  AuthorizationUtils: {
    logAuditEvent: jest.fn().mockResolvedValue(undefined),
    buildErrorRedirectUrl: jest.fn().mockReturnValue('https://example.com/callback?error=invalid_request')
  },
  ScopeUtils: {
    validateScopes: jest.fn().mockReturnValue(['read', 'write']),
    formatScopesForResponse: jest.fn().mockReturnValue('read write')
  },
  PKCEUtils: {
    validateCodeChallenge: jest.fn().mockReturnValue(true),
    generateCodeChallenge: jest.fn().mockReturnValue('test_challenge')
  }
}))

// Mock the authentication middleware
jest.mock('@/lib/auth/middleware', () => ({
  authenticateBearer: jest.fn()
}))

// Mock the authorization code flow
jest.mock('@/lib/auth/authorizationCodeFlow', () => ({
  storeAuthorizationCode: jest.fn().mockResolvedValue('generated_auth_code_123')
}))

describe('/api/v2/oauth/authorize', () => {
  let testClient: any
  let testUser: any
  let testUserSession: any

  beforeEach(async () => {
    // Clean up test data
    await global.testUtils.cleanupTestData()

    // Create test user
    testUser = await global.testUtils.createTestUser({
      username: 'testuser',
      email: 'test@example.com'
    })

    // Create test client
    testClient = await global.testUtils.createTestClient({
      clientId: 'test_client_123',
      name: 'Test Client',
      clientType: 'PUBLIC',
      redirectUris: ['https://example.com/callback', 'https://app.example.com/auth'],
      scopes: ['read', 'write', 'profile'],
      requirePkce: true
    })

    // Create test user session
    testUserSession = await prisma.userSession.create({
      data: {
        sessionToken: 'test_session_token',
        userId: testUser.id,
        expiresAt: addHours(new Date(), 24)
      }
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('Parameter Validation', () => {
    it('should validate required parameters', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      // Missing required parameters
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('invalid_request')
      expect(data.error_description).toContain('client_id is required')
    })

    it('should validate client_id parameter', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', 'invalid_client')
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_client')
    })

    it('should validate response_type parameter', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'invalid_type')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=unsupported_response_type')
    })

    it('should validate redirect_uri parameter', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://malicious.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('invalid_request')
      expect(data.error_description).toContain('Invalid redirect_uri')
    })

    it('should validate scope parameter', async () => {
      const { ScopeUtils } = require('@/lib/auth/oauth2')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      
      ScopeUtils.validateScopes.mockImplementation(() => {
        throw new OAuth2Error('Invalid scope', OAuth2ErrorCode.InvalidScope, 400)
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('scope', 'invalid_scope')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_scope')
    })

    it('should validate state parameter length', async () => {
      const longState = 'a'.repeat(1025) // Exceed 1024 character limit
      
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('state', longState)
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_request')
      expect(response.headers.get('Location')).toContain('state parameter too long')
    })
  })

  describe('Client Validation', () => {
    it('should validate client exists and is active', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', 'nonexistent_client')
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_client')
    })

    it('should validate client is not deactivated', async () => {
      // Deactivate the client
      await prisma.oAuthClient.update({
        where: { id: testClient.id },
        data: { isActive: false }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_client')
    })

    it('should validate redirect_uri is registered for client', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://unregistered.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('invalid_request')
      expect(data.error_description).toContain('Invalid redirect_uri')
    })

    it('should validate client supports authorization_code grant', async () => {
      // Create client without authorization_code grant
      const restrictedClient = await global.testUtils.createTestClient({
        clientId: 'restricted_client',
        name: 'Restricted Client',
        grantTypes: ['client_credentials'], // No authorization_code
        redirectUris: ['https://example.com/callback']
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', restrictedClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=unauthorized_client')
    })
  })

  describe('PKCE Validation', () => {
    it('should require PKCE for public clients', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      // Missing code_challenge
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_request')
      expect(response.headers.get('Location')).toContain('code_challenge is required')
    })

    it('should validate code_challenge format', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'invalid_challenge') // Too short
      url.searchParams.set('code_challenge_method', 'S256')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_request')
      expect(response.headers.get('Location')).toContain('Invalid code_challenge')
    })

    it('should validate code_challenge_method', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'plain') // Not supported
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toContain('error=invalid_request')
      expect(response.headers.get('Location')).toContain('Unsupported code_challenge_method')
    })

    it('should accept valid PKCE parameters', async () => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      authenticateBearer.mockResolvedValue({
        user: testUser,
        session: testUserSession
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('https://example.com/callback')
      expect(location).toContain('code=')
      expect(location).not.toContain('error=')
    })
  })

  describe('User Authentication', () => {
    it('should redirect to login if user not authenticated', async () => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      const { AuthenticationError } = require('@/lib/errors')
      authenticateBearer.mockRejectedValue(new AuthenticationError('Not authenticated'))

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/login')
      expect(location).toContain('returnUrl=')
    })

    it('should proceed if user is authenticated', async () => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      authenticateBearer.mockResolvedValue({
        user: testUser,
        session: testUserSession
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      expect(authenticateBearer).toHaveBeenCalledWith(request, false)
    })
  })

  describe('Consent Handling', () => {
    beforeEach(() => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      authenticateBearer.mockResolvedValue({
        user: testUser,
        session: testUserSession
      })
    })

    it('should redirect to consent page for first-party clients requiring consent', async () => {
      // Update client to require consent
      await prisma.oAuthClient.update({
        where: { id: testClient.id },
        data: { 
          skipConsent: false,
          isFirstParty: true
        }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read write')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/consent')
    })

    it('should redirect to consent page for third-party clients', async () => {
      // Update client to be third-party
      await prisma.oAuthClient.update({
        where: { id: testClient.id },
        data: { isFirstParty: false }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/consent')
    })

    it('should skip consent for first-party clients with skipConsent=true', async () => {
      // Update client to skip consent
      await prisma.oAuthClient.update({
        where: { id: testClient.id },
        data: { 
          skipConsent: true,
          isFirstParty: true
        }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('https://example.com/callback')
      expect(location).toContain('code=')
      expect(location).not.toContain('/consent')
    })

    it('should check existing user consent', async () => {
      // Create existing consent
      await prisma.userConsent.create({
        data: {
          userId: testUser.id,
          clientId: testClient.id,
          scopes: ['read'],
          grantedAt: new Date()
        }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read') // Same scope as consented
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('https://example.com/callback')
      expect(location).toContain('code=')
    })

    it('should require new consent for additional scopes', async () => {
      // Create existing consent with limited scope
      await prisma.userConsent.create({
        data: {
          userId: testUser.id,
          clientId: testClient.id,
          scopes: ['read'],
          grantedAt: new Date()
        }
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read write') // Additional scope
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('/consent')
    })
  })

  describe('Authorization Code Generation', () => {
    beforeEach(() => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      authenticateBearer.mockResolvedValue({
        user: testUser,
        session: testUserSession
      })
    })

    it('should generate authorization code successfully', async () => {
      const { storeAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      storeAuthorizationCode.mockResolvedValue('generated_auth_code_123')

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      url.searchParams.set('state', 'test_state_123')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('https://example.com/callback')
      expect(location).toContain('code=generated_auth_code_123')
      expect(location).toContain('state=test_state_123')
      
      expect(storeAuthorizationCode).toHaveBeenCalledWith({
        clientId: testClient.id,
        userId: testUser.id,
        redirectUri: 'https://example.com/callback',
        scopes: ['read'],
        codeChallenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        codeChallengeMethod: 'S256'
      })
    })

    it('should include state parameter in redirect', async () => {
      const { storeAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      storeAuthorizationCode.mockResolvedValue('auth_code_with_state')

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      url.searchParams.set('state', 'custom_state_value')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('state=custom_state_value')
    })

    it('should handle authorization code generation failure', async () => {
      const { storeAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      storeAuthorizationCode.mockRejectedValue(new Error('Database error'))

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('error=server_error')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed URLs gracefully', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'not-a-valid-url')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('invalid_request')
    })

    it('should preserve error state in redirects', async () => {
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('scope', 'invalid_scope')
      url.searchParams.set('state', 'preserve_this_state')
      
      const request = new NextRequest(url)
      const response = await GET(request)

      expect(response.status).toBe(302)
      const location = response.headers.get('Location')
      expect(location).toContain('error=invalid_scope')
      expect(location).toContain('state=preserve_this_state')
    })

    it('should log audit events for authorization attempts', async () => {
      const { AuthorizationUtils } = require('@/lib/auth/oauth2')
      
      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', 'invalid_client')
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      
      const request = new NextRequest(url)
      await GET(request)

      expect(AuthorizationUtils.logAuditEvent).toHaveBeenCalled()
    })
  })

  describe('Security Headers', () => {
    it('should set appropriate security headers', async () => {
      const { authenticateBearer } = require('@/lib/auth/middleware')
      authenticateBearer.mockResolvedValue({
        user: testUser,
        session: testUserSession
      })

      const url = new URL('http://localhost:3000/api/v2/oauth/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', testClient.clientId)
      url.searchParams.set('redirect_uri', 'https://example.com/callback')
      url.searchParams.set('code_challenge', 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', 'read')
      
      const request = new NextRequest(url, {
        headers: {
          'Authorization': 'Bearer test_session_token'
        }
      })
      const response = await GET(request)

      expect(response.headers.get('Cache-Control')).toContain('no-store')
      expect(response.headers.get('Pragma')).toBe('no-cache')
    })
  })
})