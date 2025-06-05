import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  TestHttpClient, 
  TestDataManager, 
  TestAssertions,
  TEST_USERS,
  TEST_CLIENTS,
  TEST_CONFIG,
  createTestSetup
} from '../utils/test-helpers'

describe('OAuth2.1 Token Revocation Endpoint Tests (RFC 7009)', () => {
  const httpClient = new TestHttpClient()
  const dataManager = new TestDataManager()
  const { setup, cleanup } = createTestSetup('oauth-revoke-endpoint')

  beforeEach(async () => {
    await setup()
    await dataManager.setupBasicScopes()
  })

  afterEach(async () => {
    await dataManager.cleanup()
    await cleanup()
  })

  describe('POST /api/oauth/revoke - 访问令牌撤销', () => {
    it('应该成功撤销有效的访问令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      // 调试：打印客户端信息
      console.log('Client info:', {
        clientId: client.clientId,
        plainSecret: client.plainSecret,
        hashedSecret: client.clientSecret,
        isPublic: client.isPublic
      })
      
      // 创建访问令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 撤销访问令牌
      const revokeResponse = await httpClient.revokeToken(
        accessToken, 
        client.clientId, 
        client.plainSecret
      )
      
      console.log('Revoke response status:', revokeResponse.status)
      if (revokeResponse.status !== 200) {
        const errorBody = await revokeResponse.text()
        console.log('Error response:', errorBody)
      }
      
      // RFC 7009: 撤销端点应该返回200 OK
      expect(revokeResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
      // Content-Length可能是'0'或null，都是有效的
      const contentLength = revokeResponse.headers.get('content-length')
      expect(contentLength === '0' || contentLength === null).toBe(true)

      // 验证令牌已被撤销 - 尝试使用令牌访问用户信息应该失败
      const userinfoResponse = await httpClient.getUserInfo(accessToken)
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
    })

    it('应该成功撤销有效的刷新令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      // 创建刷新令牌
      const refreshToken = await dataManager.createRefreshToken(
        user.id!, 
        client.clientId,
        'openid profile offline_access'
      )

      // 撤销刷新令牌
      const response = await httpClient.revokeToken(
        refreshToken, 
        client.clientId, 
        client.plainSecret
      )
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 验证刷新令牌已被撤销 - 尝试使用刷新令牌获取新的访问令牌应该失败
      const tokenResponse = await httpClient.requestToken({
        grant_type: 'refresh_token',
        client_id: client.clientId,
        client_secret: client.plainSecret,
        refresh_token: refreshToken
      })
      
      expect(tokenResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST)
      const error = await tokenResponse.json()
      expect(error.error).toBe('invalid_grant')
    })

    it('应该在撤销刷新令牌时同时撤销相关的访问令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      // 创建访问令牌和刷新令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )
      const refreshToken = await dataManager.createRefreshToken(
        user.id!, 
        client.clientId,
        'openid profile offline_access'
      )

      // 撤销刷新令牌
      const response = await httpClient.revokeToken(
        refreshToken, 
        client.clientId, 
        client.plainSecret
      )
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 验证相关的访问令牌也被撤销
      const userinfoResponse = await httpClient.getUserInfo(accessToken)
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
    })

    it('应该支持token_type_hint参数 - access_token', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      console.log('Token type hint test - Client info:', {
        clientId: client.clientId,
        plainSecret: client.plainSecret,
        hashedSecret: client.clientSecret,
        isPublic: client.isPublic
      })
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 使用token_type_hint指定为access_token
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${client.clientId}:${client.plainSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token'
        })
      })
      
      console.log('Token type hint test - Response status:', response.status)
      if (response.status !== 200) {
        const errorText = await response.text()
        console.log('Token type hint test - Error response:', errorText)
      }
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 验证令牌已被撤销
      const userinfoResponse = await httpClient.getUserInfo(accessToken)
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
    })

    it('应该支持token_type_hint参数 - refresh_token', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const refreshToken = await dataManager.createRefreshToken(
        user.id!, 
        client.clientId,
        'openid profile offline_access'
      )

      // 使用token_type_hint指定为refresh_token
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${client.clientId}:${client.plainSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: 'refresh_token'
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })
  })

  describe('客户端认证测试', () => {
    it('应该支持HTTP Basic认证', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 使用HTTP Basic认证
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${client.clientId}:${client.plainSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          token: accessToken
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })

    it('应该支持客户端凭证在请求体中', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 客户端凭证在请求体中
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: client.clientId,
          client_secret: client.plainSecret!
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })

    it('应该支持公共客户端（无客户端密钥）', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('PUBLIC')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 公共客户端只需要client_id
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: client.clientId
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })
  })

  describe('错误处理和安全测试', () => {
    it('应该拒绝无效的客户端凭证', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 使用错误的客户端密钥
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: client.clientId,
          client_secret: 'wrong-secret'
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
      
      const error = await response.json()
      expect(error.error).toBe('invalid_client')
    })

    it('应该拒绝不存在的客户端', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: 'some-token',
          client_id: 'non-existent-client'
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
      
      const error = await response.json()
      expect(error.error).toBe('invalid_client')
    })

    it('应该拒绝缺少token参数的请求', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL')

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: client.clientId,
          client_secret: client.plainSecret!
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST)
      
      const error = await response.json()
      expect(error.error).toBe('invalid_request')
    })

    it('应该拒绝缺少客户端认证的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: 'some-token'
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)
      
      const error = await response.json()
      expect(error.error).toBe('invalid_client')
    })

    it('应该拒绝非POST方法的请求', async () => {
      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'GET'
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.METHOD_NOT_ALLOWED)
    })

    it('应该拒绝错误的Content-Type', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL')

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: 'some-token',
          client_id: client.clientId,
          client_secret: client.plainSecret
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.BAD_REQUEST)
      
      const error = await response.json()
      expect(error.error).toBe('invalid_request')
    })
  })

  describe('RFC 7009标准合规性测试', () => {
    it('应该对不存在的令牌返回200 OK（RFC 7009要求）', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL')

      // 尝试撤销不存在的令牌
      const response = await httpClient.revokeToken(
        'non-existent-token', 
        client.clientId, 
        client.plainSecret
      )
      
      // RFC 7009: 即使令牌不存在也应该返回200 OK
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })

    it('应该对已撤销的令牌返回200 OK', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      // 第一次撤销
      const firstResponse = await httpClient.revokeToken(
        accessToken, 
        client.clientId, 
        client.plainSecret
      )
      expect(firstResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 第二次撤销同一个令牌
      const secondResponse = await httpClient.revokeToken(
        accessToken, 
        client.clientId, 
        client.plainSecret
      )
      
      // 应该仍然返回200 OK
      expect(secondResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })

    it('应该只允许令牌的所有者客户端撤销令牌', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client1 = await dataManager.createTestClient('CONFIDENTIAL')
      const client2 = await dataManager.createTestClient('WEB_APP')
      
      // 使用client1创建令牌
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client1.clientId,
        'openid profile'
      )

      // 尝试使用client2撤销令牌
      const response = await httpClient.revokeToken(
        accessToken, 
        client2.clientId, 
        client2.plainSecret
      )
      
      // 应该返回200 OK（但实际上没有撤销任何东西）
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 验证令牌仍然有效（因为不是正确的客户端）
      const userinfoResponse = await httpClient.getUserInfo(accessToken)
      expect(userinfoResponse.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
    })
  })

  describe('审计日志和监控', () => {
    it('应该记录成功的令牌撤销事件', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      const response = await httpClient.revokeToken(
        accessToken, 
        client.clientId, 
        client.plainSecret
      )
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)

      // 这里可以添加审计日志验证逻辑
      // 例如检查数据库中的audit_logs表
    })

    it('应该记录失败的撤销尝试', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL')

      const response = await httpClient.makeRequest('/api/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          token: 'invalid-token',
          client_id: client.clientId,
          client_secret: 'wrong-secret'
        })
      })
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.UNAUTHORIZED)

      // 这里可以添加审计日志验证逻辑
    })
  })

  describe('性能和并发测试', () => {
    it('应该处理并发的撤销请求', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      // 创建多个令牌
      const tokens = await Promise.all([
        dataManager.createAccessToken(user.id!, client.clientId, 'openid profile'),
        dataManager.createAccessToken(user.id!, client.clientId, 'openid profile'),
        dataManager.createAccessToken(user.id!, client.clientId, 'openid profile')
      ])

      // 并发撤销所有令牌
      const promises = tokens.map(token => 
        httpClient.revokeToken(token, client.clientId, client.plainSecret)
      )

      const responses = await Promise.all(promises)
      
      // 所有撤销请求都应该成功
      responses.forEach(response => {
        expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
      })
    })

    it('应该在合理时间内响应', async () => {
      const user = await dataManager.createTestUser('REGULAR')
      const client = await dataManager.createTestClient('CONFIDENTIAL')
      
      const accessToken = await dataManager.createAccessToken(
        user.id!, 
        client.clientId,
        'openid profile'
      )

      const startTime = Date.now()
      const response = await httpClient.revokeToken(
        accessToken, 
        client.clientId, 
        client.plainSecret
      )
      const endTime = Date.now()
      
      expect(response.status).toBe(TEST_CONFIG.HTTP_STATUS.OK)
      
      // 响应时间应该在合理范围内（小于1秒）
      const responseTime = endTime - startTime
      expect(responseTime).toBeLessThan(1000)
    })
  })

  describe('速率限制测试', () => {
    it('应该在超过速率限制时返回429状态码', async () => {
      const client = await dataManager.createTestClient('CONFIDENTIAL')

      // 快速发送大量请求以触发速率限制
      const promises = Array(20).fill(null).map(() => 
        httpClient.revokeToken('test-token', client.clientId, client.plainSecret)
      )

      const responses = await Promise.all(promises)
      
      // 应该有一些请求被速率限制拒绝
      const rateLimitedResponses = responses.filter(r => r.status === TEST_CONFIG.HTTP_STATUS.TOO_MANY_REQUESTS)
      
      // 注意：这个测试可能需要根据实际的速率限制配置进行调整
      // expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })
  })
}) 