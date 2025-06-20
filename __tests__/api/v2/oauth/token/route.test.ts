// __tests__/api/v2/oauth/token/route.test.ts

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/v2/oauth/token/route'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import * as jose from 'jose'
import { addHours, addDays } from 'date-fns'

// Mock the OAuth2 utils
jest.mock('@/lib/auth/oauth2', () => ({
  ClientAuthUtils: {
    authenticateClient: jest.fn()
  },
  AuthorizationUtils: {
    logAuditEvent: jest.fn().mockResolvedValue(undefined)
  },
  ScopeUtils: {
    validateScopes: jest.fn().mockReturnValue(['read', 'write']),
    formatScopesForResponse: jest.fn().mockReturnValue('read write')
  },
  JWTUtils: {
    generateAccessToken: jest.fn().mockResolvedValue('mock_access_token'),
    generateRefreshToken: jest.fn().mockResolvedValue('mock_refresh_token')
  }
}))

// Mock the authorization code flow
jest.mock('@/lib/auth/authorizationCodeFlow', () => ({
  validateAuthorizationCode: jest.fn(),
  storeAuthorizationCode: jest.fn()
}))

describe('/api/v2/oauth/token', () => {
  let testClient: any
  let testUser: any
  let testAuthCode: any
  let testRefreshToken: any

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
      clientType: 'CONFIDENTIAL',
      clientSecret: await bcrypt.hash('test_secret', 10),
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      redirectUris: ['https://example.com/callback']
    })

    // Reset mocks
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await global.testUtils.cleanupTestData()
  })

  describe('Client Authentication', () => {
    it('should authenticate client with Basic Auth', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('scope', 'read')

      const credentials = Buffer.from(`${testClient.clientId}:test_secret`).toString('base64')
      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(ClientAuthUtils.authenticateClient).toHaveBeenCalledWith(request, expect.any(FormData))
    })

    it('should authenticate client with form data', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('client_id', testClient.clientId)
      formData.append('client_secret', 'test_secret')
      formData.append('scope', 'read')

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(ClientAuthUtils.authenticateClient).toHaveBeenCalled()
    })

    it('should return 401 for invalid client credentials', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      ClientAuthUtils.authenticateClient.mockRejectedValue(
        new OAuth2Error('Invalid client credentials', OAuth2ErrorCode.InvalidClient, 401)
      )

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('client_id', 'invalid_client')
      formData.append('client_secret', 'invalid_secret')

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('invalid_client')
    })
  })

  describe('Authorization Code Grant', () => {
    beforeEach(async () => {
      // Create test authorization code
      testAuthCode = await prisma.authorizationCode.create({
        data: {
          code: 'test_auth_code_123',
          clientId: testClient.id,
          userId: testUser.id,
          redirectUri: 'https://example.com/callback',
          scopes: ['read', 'write'],
          expiresAt: addHours(new Date(), 1),
          used: false,
          codeChallenge: 'test_challenge',
          codeChallengeMethod: 'S256'
        }
      })
    })

    it('should exchange authorization code for tokens successfully', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { validateAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      validateAuthorizationCode.mockResolvedValue({
        authCode: testAuthCode,
        user: testUser,
        client: testClient
      })

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_auth_code_123')
      formData.append('redirect_uri', 'https://example.com/callback')
      formData.append('code_verifier', 'test_verifier')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.access_token).toBe('mock_access_token')
      expect(data.refresh_token).toBe('mock_refresh_token')
      expect(data.token_type).toBe('Bearer')
      expect(data.expires_in).toBeDefined()
      expect(data.scope).toBe('read write')
    })

    it('should return 400 for invalid authorization code', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { validateAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      validateAuthorizationCode.mockRejectedValue(
        new OAuth2Error('Invalid authorization code', OAuth2ErrorCode.InvalidGrant, 400)
      )

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'invalid_code')
      formData.append('redirect_uri', 'https://example.com/callback')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })

    it('should return 400 for expired authorization code', async () => {
      // Update auth code to be expired
      await prisma.authorizationCode.update({
        where: { id: testAuthCode.id },
        data: { expiresAt: new Date(Date.now() - 1000) } // 1 second ago
      })

      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_auth_code_123')
      formData.append('redirect_uri', 'https://example.com/callback')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
      expect(data.error_description).toContain('expired')
    })

    it('should return 400 for already used authorization code', async () => {
      // Mark auth code as used
      await prisma.authorizationCode.update({
        where: { id: testAuthCode.id },
        data: { used: true }
      })

      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_auth_code_123')
      formData.append('redirect_uri', 'https://example.com/callback')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
      expect(data.error_description).toContain('already been used')
    })

    it('should validate PKCE code verifier', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { validateAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      validateAuthorizationCode.mockRejectedValue(
        new OAuth2Error('PKCE verification failed', OAuth2ErrorCode.InvalidGrant, 400)
      )

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_auth_code_123')
      formData.append('redirect_uri', 'https://example.com/callback')
      formData.append('code_verifier', 'wrong_verifier')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })

    it('should validate redirect_uri matches', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { validateAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      validateAuthorizationCode.mockRejectedValue(
        new OAuth2Error('Redirect URI mismatch', OAuth2ErrorCode.InvalidGrant, 400)
      )

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_auth_code_123')
      formData.append('redirect_uri', 'https://different.com/callback')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })
  })

  describe('Refresh Token Grant', () => {
    beforeEach(async () => {
      // Create test refresh token
      testRefreshToken = await prisma.refreshToken.create({
        data: {
          token: 'test_refresh_token_123',
          clientId: testClient.id,
          userId: testUser.id,
          scopes: ['read', 'write'],
          expiresAt: addDays(new Date(), 30),
          revokedAt: null
        }
      })
    })

    it('should refresh tokens successfully', async () => {
      const { ClientAuthUtils, JWTUtils } = require('@/lib/auth/oauth2')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      JWTUtils.generateAccessToken.mockResolvedValue('new_access_token')
      JWTUtils.generateRefreshToken.mockResolvedValue('new_refresh_token')

      const formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', 'test_refresh_token_123')
      formData.append('scope', 'read')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.access_token).toBe('new_access_token')
      expect(data.refresh_token).toBe('new_refresh_token')
      expect(data.token_type).toBe('Bearer')
    })

    it('should return 400 for invalid refresh token', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', 'invalid_refresh_token')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })

    it('should return 400 for expired refresh token', async () => {
      // Update refresh token to be expired
      await prisma.refreshToken.update({
        where: { id: testRefreshToken.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      })

      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', 'test_refresh_token_123')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })

    it('should return 400 for revoked refresh token', async () => {
      // Revoke refresh token
      await prisma.refreshToken.update({
        where: { id: testRefreshToken.id },
        data: { revokedAt: new Date() }
      })

      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', 'test_refresh_token_123')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_grant')
    })

    it('should validate scope restrictions', async () => {
      const { ClientAuthUtils, ScopeUtils } = require('@/lib/auth/oauth2')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      ScopeUtils.validateScopes.mockReturnValue(['read']) // Only allow read scope

      const formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', 'test_refresh_token_123')
      formData.append('scope', 'read write admin') // Request more than allowed
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(ScopeUtils.validateScopes).toHaveBeenCalledWith(
        'read write admin',
        ['read', 'write'] // Original scopes from refresh token
      )
    })
  })

  describe('Client Credentials Grant', () => {
    it('should issue tokens for client credentials grant', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('scope', 'read write')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.access_token).toBe('mock_access_token')
      expect(data.token_type).toBe('Bearer')
      expect(data.expires_in).toBeDefined()
      expect(data.scope).toBe('read write')
      expect(data).not.toHaveProperty('refresh_token') // No refresh token for client credentials
    })

    it('should validate client has client_credentials grant type', async () => {
      // Create client without client_credentials grant
      const restrictedClient = await global.testUtils.createTestClient({
        clientId: 'restricted_client',
        name: 'Restricted Client',
        grantTypes: ['authorization_code'] // No client_credentials
      })

      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(restrictedClient)

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('scope', 'read')
      formData.append('client_id', restrictedClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('unauthorized_client')
    })

    it('should validate requested scopes', async () => {
      const { ClientAuthUtils, ScopeUtils } = require('@/lib/auth/oauth2')
      const { OAuth2Error, OAuth2ErrorCode } = require('@/lib/errors')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      ScopeUtils.validateScopes.mockImplementation(() => {
        throw new OAuth2Error('Invalid scope', OAuth2ErrorCode.InvalidScope, 400)
      })

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('scope', 'invalid_scope')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_scope')
    })
  })

  describe('Grant Type Validation', () => {
    it('should return 400 for missing grant_type', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_request')
      expect(data.error_description).toContain('grant_type is required')
    })

    it('should return 400 for unsupported grant_type', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'unsupported_grant')
      formData.append('client_id', testClient.clientId)

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('unsupported_grant_type')
    })

    it('should validate required parameters for each grant type', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      // Test authorization_code grant without required code parameter
      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('redirect_uri', 'https://example.com/callback')
      // Missing 'code' parameter

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_request')
    })
  })

  describe('Token Response Format', () => {
    it('should return proper token response format', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)

      const formData = new FormData()
      formData.append('grant_type', 'client_credentials')
      formData.append('scope', 'read')

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      
      // Verify response structure
      expect(data).toHaveProperty('access_token')
      expect(data).toHaveProperty('token_type')
      expect(data).toHaveProperty('expires_in')
      expect(data).toHaveProperty('scope')
      expect(typeof data.access_token).toBe('string')
      expect(data.token_type).toBe('Bearer')
      expect(typeof data.expires_in).toBe('number')
      expect(typeof data.scope).toBe('string')
    })

    it('should include refresh_token for authorization_code grant', async () => {
      const { ClientAuthUtils } = require('@/lib/auth/oauth2')
      const { validateAuthorizationCode } = require('@/lib/auth/authorizationCodeFlow')
      
      ClientAuthUtils.authenticateClient.mockResolvedValue(testClient)
      validateAuthorizationCode.mockResolvedValue({
        authCode: testAuthCode,
        user: testUser,
        client: testClient
      })

      const formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', 'test_code')
      formData.append('redirect_uri', 'https://example.com/callback')

      const request = new NextRequest('http://localhost:3000/api/v2/oauth/token', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('refresh_token')
      expect(typeof data.refresh_token).toBe('string')
    })
  })
})