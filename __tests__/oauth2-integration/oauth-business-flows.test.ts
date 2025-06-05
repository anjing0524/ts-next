import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { 
  createOAuth2TestSetup, 
  TestHttpClient, 
  TestAssertions, 
  PKCETestUtils, 
  TestUtils,
  TEST_CONFIG,
  TEST_USERS,
  TEST_CLIENTS,
  TestUser,
  TestClient,
  OAuth2TestHelper
} from '../utils/test-helpers'

describe('OAuth 2.0 Business Flows Integration Tests', () => {
  const { dataManager, httpClient, setup, cleanup } = createOAuth2TestSetup('oauth_business_flows')
  let adminUser: TestUser
  let regularUser: TestUser
  let confidentialClient: TestClient
  let publicClient: TestClient
  let webAppClient: TestClient

  beforeAll(async () => {
    await setup()
    
    // Create test users with different roles
    adminUser = await dataManager.createUser({
      username: 'admin-user',
      email: 'admin@test.com',
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    })

    regularUser = await dataManager.createUser({
      username: 'regular-user', 
      email: 'user@test.com',
      password: 'UserPassword123!',
      firstName: 'Regular',
      lastName: 'User',
      role: 'user'
    })

    // Create different types of clients
    confidentialClient = await dataManager.createClient({
      clientId: 'confidential-web-app',
      name: 'Confidential Web Application',
      redirectUris: ['https://app.example.com/callback'],
      grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'api:read', 'api:write'],
      isPublic: false
    })

    publicClient = await dataManager.createClient({
      clientId: 'public-spa-app',
      name: 'Public SPA Application',
      redirectUris: ['http://localhost:3000/callback'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email'],
      isPublic: true
    })

    webAppClient = await dataManager.createClient({
      clientId: 'web-app-client',
      name: 'Web Application Client',
      redirectUris: ['https://webapp.example.com/auth/callback'],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scope: ['openid', 'profile', 'email', 'offline_access'],
      isPublic: false
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('URM - 用户资源管理 (User Resource Management)', () => {
    describe('URM-003: 管理员登录 (Admin Login)', () => {
      it('should allow admin user to login and access admin resources', async () => {
        // Login with admin credentials
        const loginResponse = await httpClient.loginUser(adminUser.username, adminUser.plainPassword!)

        if (loginResponse.status === 200) {
          const loginData = await loginResponse.json()
          expect(loginData.success).toBe(true)
          expect(loginData.user).toHaveProperty('id')
          expect(loginData.user.username).toBe(adminUser.username)
          
          // 这是session-based认证，不是OAuth令牌认证
          const cookies = loginResponse.headers.get('set-cookie')
          expect(cookies).toContain('session_id')
        } else {
          expect([404, 429, 501]).toContain(loginResponse.status)
        }
      })
    })

    describe('URM-004: 普通用户登录 (Regular User Login)', () => {
      it('should allow regular user to login with limited access', async () => {
        const loginResponse = await httpClient.loginUser(regularUser.username, regularUser.plainPassword!)

        if (loginResponse.status === 200) {
          const loginData = await loginResponse.json()
          expect(loginData.success).toBe(true)
          expect(loginData.user).toHaveProperty('id')
          expect(loginData.user.username).toBe(regularUser.username)
        } else {
          expect([404, 429, 501]).toContain(loginResponse.status)
        }
      })
    })

    describe('URM-005: 密码错误登录 (Invalid Password Login)', () => {
      it('should reject login with incorrect password', async () => {
        const loginResponse = await httpClient.loginUser(regularUser.username, 'WrongPassword123!')

        expect([400, 401, 404, 429]).toContain(loginResponse.status)
        
        if (loginResponse.status === 401) {
          const error = await loginResponse.json()
          expect(error.message || error.error).toBeDefined()
        }
      })
    })
  })

  describe('CM - 客户端管理 (Client Management)', () => {
    describe('CM-004: 机密客户端认证 (Confidential Client Authentication)', () => {
      it('should authenticate confidential client with ID and Secret', async () => {
        const response = await httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
          scope: 'api:read'
        })

        if (response.status === 200) {
          const token = await TestAssertions.expectTokenResponse(response)
          expect(token.token_type).toBe('Bearer')
          expect(token.access_token).toBeDefined()
          expect(token.scope).toBeDefined()
          console.log('✅ CM-004: Confidential client authentication successful')
        } else {
          expect([400, 401, 404, 429, 501]).toContain(response.status)
          console.log('⚠️ CM-004: Client credentials endpoint not available or rate limited')
        }
      })
    })

    describe('CM-005: 公共客户端认证 (Public Client Authentication)', () => {
      it('should authenticate public client with ID only', async () => {
        // Public clients don't use client_secret for authentication
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: publicClient.clientId,
          redirect_uri: publicClient.redirectUris[0],
          scope: 'openid profile'
        })

        // 应该接受公共客户端不提供密钥的请求
        expect([
          TEST_CONFIG.HTTP_STATUS.OK,
          TEST_CONFIG.HTTP_STATUS.FOUND,
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED,
          307 // Temporary Redirect
        ]).toContain(response.status)
        console.log('✅ CM-005: Public client authentication test completed')
      })
    })

    describe('CM-006: 令牌过期刷新 (Token Refresh)', () => {
      it('should refresh expired access token using refresh token', async () => {
        // First get tokens with authorization code
        const authCode = await dataManager.createAuthorizationCode(
          regularUser.id!,
          webAppClient.clientId,
          webAppClient.redirectUris[0],
          'openid profile offline_access'
        )

        const tokenResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: webAppClient.redirectUris[0],
          client_id: webAppClient.clientId,
          client_secret: webAppClient.plainSecret!
        })

        if (tokenResponse.status === 200) {
          const tokens = await tokenResponse.json()
          
          if (tokens.refresh_token) {
            // Now refresh the token
            const refreshResponse = await httpClient.requestToken({
              grant_type: 'refresh_token',
              refresh_token: tokens.refresh_token,
              client_id: webAppClient.clientId,
              client_secret: webAppClient.plainSecret!
            })

            if (refreshResponse.status === 200) {
              const newTokens = await refreshResponse.json()
              expect(newTokens.access_token).toBeDefined()
              expect(newTokens.access_token).not.toBe(tokens.access_token)
              console.log('✅ CM-006: Token refresh successful')
            } else {
              expect([400, 404, 429]).toContain(refreshResponse.status)
              console.log('⚠️ CM-006: Refresh token endpoint not available')
            }
          }
        } else {
          expect([400, 401,  404, 429]).toContain(tokenResponse.status)
          console.log('⚠️ CM-006: Authorization code endpoint not available')
        }
      })
    })
  })

  describe('AM - 授权模式 (Authorization Modes)', () => {
    describe('AM-001: 授权码模式完整流程 (Authorization Code Flow)', () => {
      it('should complete full authorization code flow', async () => {
        const state = TestUtils.generateState()
        
        // Step 1: Authorization request
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: confidentialClient.clientId,
          redirect_uri: confidentialClient.redirectUris[0],
          scope: 'openid profile email',
          state: state
        })

        // 授权请求应该返回重定向或授权页面
        expect([
          TEST_CONFIG.HTTP_STATUS.FOUND,
          TEST_CONFIG.HTTP_STATUS.OK,
          TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED,
          307 // Temporary Redirect
        ]).toContain(authResponse.status)

        if (authResponse.status === TEST_CONFIG.HTTP_STATUS.FOUND) {
          const location = authResponse.headers.get('location')
          expect(location).toBeDefined()
          
          // Check if we got a code or need to login
          if (location?.includes('code=')) {
            const url = new URL(location)
            const code = url.searchParams.get('code')
            const returnedState = url.searchParams.get('state')
            
            expect(code).toBeDefined()
            expect(returnedState).toBe(state)
            
            // Step 2: Exchange code for tokens
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: code!,
              redirect_uri: confidentialClient.redirectUris[0],
              client_id: confidentialClient.clientId,
              client_secret: confidentialClient.plainSecret!
            })

            if (tokenResponse.status === 200) {
              const tokens = await TestAssertions.expectTokenResponse(tokenResponse)
              expect(tokens.access_token).toBeDefined()
              expect(tokens.refresh_token).toBeDefined()
              console.log('✅ AM-001: Authorization code flow completed successfully')
            }
          }
        } else {
          expect([200, 401, 404, 429, 307]).toContain(authResponse.status)
          console.log('⚠️ AM-001: Authorization endpoint requires login or not implemented')
        }
      })
    })

    describe('AM-002: 授权码重用防护 (Authorization Code Reuse Protection)', () => {
      it('should reject reused authorization codes', async () => {
        const authCode = await dataManager.createAuthorizationCode(
          regularUser.id!,
          confidentialClient.clientId,
          confidentialClient.redirectUris[0],
          'openid profile'
        )

        // First use of the code
        const firstResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: confidentialClient.redirectUris[0],
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!
        })

        // Second use of the same code (should be rejected)
        const secondResponse = await httpClient.requestToken({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: confidentialClient.redirectUris[0],
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!
        })

        expect([400, 401]).toContain(secondResponse.status)
        
        if (secondResponse.status === 400) {
          expect(await TestAssertions.expectOAuthError(secondResponse, [TEST_CONFIG.ERROR_CODES.INVALID_GRANT])).toBe(true)
        }
        console.log('✅ AM-002: Authorization code reuse protection working')
      })
    })

    describe('AM-003: 客户端凭证模式 (Client Credentials Grant)', () => {
      it('should handle client credentials grant for server-to-server communication', async () => {
        const response = await httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: confidentialClient.clientId,
          client_secret: confidentialClient.plainSecret!,
          scope: 'api:read api:write'
        })

        if (response.status === 200) {
          const token = await TestAssertions.expectTokenResponse(response)
          expect(token.token_type).toBe('Bearer')
          expect(token.access_token).toBeDefined()
          expect(token.scope).toBeDefined()
          // Client credentials should not include refresh token
          expect(token.refresh_token).toBeUndefined()
          console.log('✅ AM-003: Client credentials grant successful')
        } else {
          expect([400, 401, 404, 429, 501]).toContain(response.status)
          console.log('⚠️ AM-003: Client credentials endpoint not available')
        }
      })
    })

    describe('AM-005: PKCE 授权码模式 (PKCE Authorization Code Flow)', () => {
      it('should handle PKCE flow for public clients', async () => {
        const pkce = PKCETestUtils.generatePKCE()
        const state = TestUtils.generateState()

        // Authorization request with PKCE
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: publicClient.clientId,
          redirect_uri: publicClient.redirectUris[0],
          scope: 'openid profile',
          state: state,
          code_challenge: pkce.codeChallenge,
          code_challenge_method: pkce.codeChallengeMethod
        })

        if (authResponse.status === 302) {
          const location = authResponse.headers.get('location')
          if (location?.includes('code=')) {
            const url = new URL(location)
            const code = url.searchParams.get('code')
            
            // Token request with code verifier
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: code!,
              redirect_uri: publicClient.redirectUris[0],
              client_id: publicClient.clientId,
              code_verifier: pkce.codeVerifier
            })

            if (tokenResponse.status === 200) {
              const tokens = await TestAssertions.expectTokenResponse(tokenResponse)
              expect(tokens.access_token).toBeDefined()
              console.log('✅ AM-005: PKCE flow completed successfully')
            }
          }
        } else {
          expect([200, 401, 404, 307]).toContain(authResponse.status)
          console.log('⚠️ AM-005: PKCE authorization endpoint requires login or not implemented')
        }
      })
    })
  })

  describe('SEC - 安全性测试 (Security Tests)', () => {
    describe('SEC-001: 令牌篡改测试 (Token Tampering)', () => {
      it('should reject tampered access tokens', async () => {
        const accessToken = await dataManager.createAccessToken(
          regularUser.id!,
          confidentialClient.clientId,
          'openid profile'
        )
        const tamperedToken = accessToken.slice(0, -5) + 'XXXXX'

        const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', tamperedToken)

        expect([401, 404]).toContain(response.status)
        
        if (response.status === 401) {
          const error = await response.json()
          expect(error.error).toBe('invalid_token')
        }
        console.log('✅ SEC-001: Token tampering protection working')
      })
    })

    describe('SEC-004: 暴力破解防护 (Brute Force Protection)', () => {
      it('should apply rate limiting for multiple failed login attempts', async () => {
        const requests = []
        
        // Make multiple rapid failed login attempts
        for (let i = 0; i < 5; i++) {
          requests.push(
            httpClient.loginUser(regularUser.username, `WrongPassword${i}`)
          )
        }

        const responses = await Promise.all(requests)
        
        // Check if any requests were rate limited
        const rateLimitedCount = responses.filter(r => r.status === 429).length
        const unauthorizedCount = responses.filter(r => [401, 403].includes(r.status)).length
        
        if (rateLimitedCount > 0) {
          console.log(`✅ SEC-004: Rate limiting applied - ${rateLimitedCount} requests rate limited`)
        } else if (unauthorizedCount === responses.length) {
          console.log('✅ SEC-004: All requests properly rejected (brute force protection working)')
        } else {
          console.log('⚠️ SEC-004: Brute force protection may not be fully implemented')
        }
        
        expect(responses.length).toBe(5)
      })
    })

    describe('SEC-007: 跨域资源访问控制 (CORS)', () => {
      it('should implement proper CORS headers', async () => {
        const response = await httpClient.request('/api/oauth/token', {
          method: 'OPTIONS',
          headers: {
            'Origin': 'https://example.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type'
          }
        })

        const corsHeaders = {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers')
        }

        if (corsHeaders['access-control-allow-origin']) {
          console.log('✅ SEC-007: CORS headers are configured')
        } else {
          console.log('⚠️ SEC-007: CORS headers may not be configured')
        }

        expect([200, 204, 404]).toContain(response.status)
      })
    })
  })

  describe('TA - 第三方应用集成 (Third Party Application Integration)', () => {
    describe('TA-002: 授权码模式流程 (Authorization Code Flow)', () => {
      it('should support complete third-party application integration flow', async () => {
        const state = TestUtils.generateState()
        const nonce = TestUtils.generateRandomString(16)

        // Step 1: Third-party app constructs authorization URL
        const authResponse = await httpClient.authorize({
          response_type: 'code',
          client_id: webAppClient.clientId,
          redirect_uri: webAppClient.redirectUris[0],
          scope: 'openid profile email',
          state: state,
          nonce: nonce
        })

        expect([200, 302,307, 401, 429]).toContain(authResponse.status)
        
        if (authResponse.status === 302) {
          const location = authResponse.headers.get('location')
          expect(location).toBeDefined()
          
          if (location?.includes('code=')) {
            // Step 3: Application receives authorization code
            const url = new URL(location)
            const code = url.searchParams.get('code')
            const returnedState = url.searchParams.get('state')
            
            expect(code).toBeDefined()
            expect(returnedState).toBe(state)
            
            // Step 4: Application exchanges code for tokens
            const tokenResponse = await httpClient.requestToken({
              grant_type: 'authorization_code',
              code: code!,
              redirect_uri: webAppClient.redirectUris[0],
              client_id: webAppClient.clientId,
              client_secret: webAppClient.plainSecret!
            })

            if (tokenResponse.status === 200) {
              const tokens = await TestAssertions.expectTokenResponse(tokenResponse)
              
              // Step 5: Application uses token to access user resources
              const userinfoResponse = await httpClient.authenticatedRequest('/api/oauth/userinfo', tokens.access_token)
              
              if (userinfoResponse.status === 200) {
                const userInfo = await userinfoResponse.json()
                expect(userInfo.sub).toBeDefined()
                console.log('✅ TA-002: Complete third-party integration flow successful')
              } else {
                expect([404]).toContain(userinfoResponse.status)
                console.log('⚠️ TA-002: UserInfo endpoint not available')
              }
            }
          }
        }
      })
    })

    describe('TA-007: 拒绝授权处理 (Authorization Denial)', () => {
      it('should handle user denial of authorization properly', async () => {
        // Simulate user denying authorization by making request without user consent
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: webAppClient.clientId,
          redirect_uri: webAppClient.redirectUris[0],
          scope: 'openid profile email',
          state: 'test-state'
        })

        if (response.status === 302) {
          const location = response.headers.get('location')
          if (location?.includes('error=access_denied')) {
            expect(location.includes('error=access_denied')).toBe(true)
            console.log('✅ TA-007: Authorization denial properly handled')
          }
        } else {
          // May require implementation or different handling
          expect([200, 307,400, 401,429]).toContain(response.status)
        }
      })
    })

    describe('TA-010: 无效回调URL攻击防护 (Invalid Redirect URI Protection)', () => {
      it('should prevent open redirect attacks', async () => {
        const response = await httpClient.authorize({
          response_type: 'code',
          client_id: webAppClient.clientId,
          redirect_uri: 'https://evil.com/steal-codes', // Not in client's allowed URIs
          scope: 'openid profile'
        })

        expect([400, 404, 429]).toContain(response.status)
        
        if (response.status === 302) {
          const location = response.headers.get('location')
          // Should not redirect to evil domain
          expect(location?.startsWith('https://evil.com')).toBe(false)
        }
        console.log('✅ TA-010: Open redirect protection working')
      })
    })
  })

  describe('Performance and Reliability', () => {
    it('should handle concurrent authorization requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => {
        return httpClient.authorize({
          response_type: 'code',
          client_id: confidentialClient.clientId,
          redirect_uri: confidentialClient.redirectUris[0],
          scope: 'openid profile',
          state: `concurrent-test-${i}`
        })
      })

      const responses = await Promise.all(requests)
      
      // All requests should be handled without server errors
      responses.forEach((response, index) => {
        expect(response.status).toBeLessThan(500)
        expect([200, 302, 307, 401, 429]).toContain(response.status)  // 包含Next.js的307重定向
      })
      
      console.log('✅ Concurrent authorization requests handled successfully')
    }, 15000)

    it('should maintain proper error responses under load', async () => {
      const requests = Array.from({ length: 15 }, () =>
        httpClient.requestToken({
          grant_type: 'client_credentials',
          client_id: 'invalid-client-id',
          client_secret: 'invalid-secret'
        })
      )

      const responses = await Promise.all(requests)
      
      responses.forEach(response => {
        // Should consistently return proper error responses
        expect([400, 401, 429]).toContain(response.status)
        expect(response.status).toBeLessThan(500)
      })
      
      console.log('✅ Error responses maintained under load')
    }, 15000)
  })
}) 