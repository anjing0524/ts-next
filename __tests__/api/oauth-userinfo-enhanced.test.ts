/**
 * OAuth2.1 UserInfo端点增强测试套件
 * 
 * 测试目标：
 * 1. 提升/api/oauth/userinfo端点的代码覆盖率
 * 2. 验证OpenID Connect UserInfo端点的完整功能
 * 3. 测试各种作用域组合和权限验证
 * 4. 覆盖所有错误处理路径和边界条件
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createOAuth2TestSetup, TestUtils } from '../utils/test-helpers'
import { prisma } from '@/lib/prisma'

describe('OAuth2 UserInfo端点增强测试', () => {
  const testSetup = createOAuth2TestSetup('oauth_userinfo_enhanced')
  const { dataManager, oauth2Helper, httpClient } = testSetup
  
  let testUser: any
  let testClient: any
  let accessToken: string

  beforeAll(async () => {
    await testSetup.setup()
    
    // 创建测试用户和客户端
    testUser = await dataManager.createTestUser('REGULAR')
    testClient = await dataManager.createTestClient('WEB_APP')
    
    // 创建访问令牌
    accessToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid profile email')
  })

  afterAll(async () => {
    await testSetup.cleanup()
  })

  describe('正常流程测试', () => {
    it('应该返回基本的OpenID Connect用户信息', async () => {
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      
      expect(userInfo).toHaveProperty('sub', testUser.id)
      expect(userInfo).toHaveProperty('name')
      expect(userInfo).toHaveProperty('email')
      expect(userInfo).toHaveProperty('email_verified')
    })

    it('应该根据profile作用域返回个人资料信息', async () => {
      const profileToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid profile')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', profileToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      
      expect(userInfo).toHaveProperty('sub', testUser.id)
      expect(userInfo).toHaveProperty('name')
      expect(userInfo).toHaveProperty('given_name')
      expect(userInfo).toHaveProperty('family_name')
      expect(userInfo).toHaveProperty('preferred_username')
    })

    it('应该根据email作用域返回邮箱信息', async () => {
      const emailToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid email')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', emailToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      
      expect(userInfo).toHaveProperty('sub', testUser.id)
      expect(userInfo).toHaveProperty('email')
      expect(userInfo).toHaveProperty('email_verified')
    })
  })

  describe('错误处理测试', () => {
    it('应该拒绝缺少Authorization头的请求', async () => {
      const response = await httpClient.request('/api/oauth/userinfo')
      
      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe('invalid_token')
    })

    it('应该拒绝无效的访问令牌', async () => {
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', 'invalid_token')
      
      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe('invalid_token')
    })

    it('应该拒绝过期的访问令牌', async () => {
      // 创建一个过期的令牌
      const expiredToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid profile')
      
      // 手动设置令牌为过期状态
      const tokenHash = TestUtils.createTokenHash(expiredToken)
      await prisma.accessToken.update({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 1000) } // 1秒前过期
      })
      
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', expiredToken)
      
      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe('invalid_token')
    })

    it('应该拒绝缺少openid作用域的令牌', async () => {
      const noOpenIdToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'profile email')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', noOpenIdToken)
      
      expect(response.status).toBe(403)
      const error = await response.json()
      expect(error.error).toBe('insufficient_scope')
    })

    it('应该拒绝被撤销的访问令牌', async () => {
      const revokedToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid profile')
      
      // 撤销令牌
      const tokenHash = TestUtils.createTokenHash(revokedToken)
      await prisma.accessToken.update({
        where: { tokenHash },
        data: { 
          revoked: true,
          revokedAt: new Date() 
        }
      })
      
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', revokedToken)
      
      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error).toBe('invalid_token')
    })
  })

  describe('作用域组合测试', () => {
    it('应该正确处理多个作用域组合', async () => {
      const multiScopeToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid profile email')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', multiScopeToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      
      // 应该包含所有作用域的信息
      expect(userInfo).toHaveProperty('sub')
      expect(userInfo).toHaveProperty('name')
      expect(userInfo).toHaveProperty('email')
      expect(userInfo).toHaveProperty('given_name')
      expect(userInfo).toHaveProperty('family_name')
      expect(userInfo).toHaveProperty('email_verified')
    })

    it('应该只返回请求作用域内的信息', async () => {
      const limitedToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'openid')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', limitedToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      
      // 只应该包含基本的sub信息
      expect(userInfo).toHaveProperty('sub')
      expect(Object.keys(userInfo)).toHaveLength(1)
    })
  })

  describe('边界条件测试', () => {
    it('应该处理不活跃的用户', async () => {
      const inactiveUser = await dataManager.createTestUser('INACTIVE')
      const inactiveToken = await dataManager.createAccessToken(inactiveUser.id!, testClient.clientId, 'openid profile')
      
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', inactiveToken)
      
      // 根据实现，可能返回401或200但标记为不活跃
      expect([200, 401]).toContain(response.status)
    })

    it('应该处理邮箱未验证的用户', async () => {
      const unverifiedUser = await dataManager.createUser({
        username: 'unverified_user',
        email: 'unverified@test.com',
        password: 'TestPass123!',
        firstName: 'Unverified',
        lastName: 'User',
        isActive: true,
        emailVerified: false
      })
      
      const unverifiedToken = await dataManager.createAccessToken(unverifiedUser.id!, testClient.clientId, 'openid email')
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', unverifiedToken)
      
      expect(response.status).toBe(200)
      const userInfo = await response.json()
      expect(userInfo.email_verified).toBe(false)
    })
  })

  describe('性能和并发测试', () => {
    it('应该能够处理并发请求', async () => {
      const concurrentRequests = Array(5).fill(null).map(() =>
        httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken)
      )
      
      const responses = await Promise.all(concurrentRequests)
      
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })

    it('应该在合理时间内响应', async () => {
      const startTime = Date.now()
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken)
      const endTime = Date.now()
      
      expect(response.status).toBe(200)
      expect(endTime - startTime).toBeLessThan(1000) // 应该在1秒内响应
    })
  })

  describe('HTTP方法测试', () => {
    it('应该支持GET方法', async () => {
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken, {
        method: 'GET'
      })
      
      expect(response.status).toBe(200)
    })

    it('应该支持POST方法', async () => {
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken, {
        method: 'POST'
      })
      
      expect(response.status).toBe(200)
    })

    it('应该拒绝不支持的HTTP方法', async () => {
      const response = await httpClient.authenticatedRequest('/api/oauth/userinfo', accessToken, {
        method: 'PUT'
      })
      
      expect(response.status).toBe(405)
    })
  })
}) 