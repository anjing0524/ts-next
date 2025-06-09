import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TestHttpClient, TestDataManager, TestAssertions } from '../utils/test-helpers'

describe('客户端管理API测试', () => {
  let httpClient: TestHttpClient
  let dataManager: TestDataManager
  let assertions: TestAssertions
  let adminUser: any
  let adminToken: any

  beforeEach(async () => {
    httpClient = new TestHttpClient()
    dataManager = new TestDataManager()
    assertions = new TestAssertions()
    
    await dataManager.clearDatabase()
    
    // 创建管理员用户
    adminUser = await dataManager.createTestUser('ADMIN')

    // 创建管理员访问令牌
    const adminClient = await dataManager.createTestClient({
      clientId: 'admin-client',
      clientSecret: 'admin-secret',
      clientType: 'confidential',
      redirectUris: ['https://admin.example.com/callback'],
      allowedScopes: ['admin:clients', 'admin:read', 'admin:write']
    })

    adminToken = await dataManager.createAccessToken(
      adminUser.id!,
      adminClient.clientId,
      'admin:clients admin:read admin:write'
    )
  })

  afterEach(async () => {
    await dataManager.clearDatabase()
  })

  describe('POST /api/clients - 创建客户端', () => {
    describe('✅ 正常流程测试', () => {
      it('应该成功创建公共客户端', async () => {
        const clientData = {
          name: '测试公共客户端',
          description: '用于测试的公共客户端应用',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback', 'https://app.example.com/silent-renew'],
          allowedScopes: ['openid', 'profile', 'email'],
          grants: ['authorization_code'],
          requirePkce: true
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(201)
        expect(response.data).toMatchObject({
          id: expect.any(String),
          clientId: expect.stringMatching(/^[a-zA-Z0-9_-]{16,}$/),
          name: clientData.name,
          description: clientData.description,
          clientType: 'public',
          redirectUris: clientData.redirectUris,
          allowedScopes: clientData.allowedScopes,
          grants: clientData.grants,
          requirePkce: true,
          createdAt: expect.any(String)
        })

        // 公共客户端不应该返回客户端密钥
        expect(response.data).not.toHaveProperty('clientSecret')
      })

      it('应该成功创建机密客户端', async () => {
        const clientData = {
          name: '测试机密客户端',
          description: '用于服务器端应用的机密客户端',
          clientType: 'confidential',
          redirectUris: ['https://server.example.com/oauth/callback'],
          allowedScopes: ['openid', 'profile', 'email', 'api:read', 'api:write'],
          grants: ['authorization_code', 'refresh_token', 'client_credentials'],
          requirePkce: false
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(201)
        expect(response.data).toMatchObject({
          clientId: expect.any(String),
          clientSecret: expect.stringMatching(/^[a-zA-Z0-9_-]{32,}$/),
          clientType: 'confidential',
          requirePkce: false
        })
      })

      it('应该自动为公共客户端启用PKCE', async () => {
        const clientData = {
          name: '自动PKCE客户端',
          clientType: 'public',
          redirectUris: ['https://spa.example.com/callback'],
          allowedScopes: ['openid', 'profile'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(201)
        expect(response.data.requirePkce).toBe(true)
      })
    })

    describe('❌ 异常处理测试', () => {
      it('应该拒绝无效的重定向URI', async () => {
        const clientData = {
          name: '无效重定向URI客户端',
          clientType: 'public',
          redirectUris: ['not-a-valid-uri', 'javascript:alert(1)'],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_redirect_uri',
          error_description: expect.stringContaining('Invalid redirect URI')
        })
      })

      it('应该拒绝缺少必需字段的请求', async () => {
        const clientData = {
          name: '缺少字段的客户端'
          // 缺少 clientType, redirectUris, allowedScopes, grants
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_request',
          error_description: expect.stringContaining('Missing required fields')
        })
      })

      it('应该拒绝无效的授权类型组合', async () => {
        const clientData = {
          name: '无效授权类型客户端',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid'],
          grants: ['client_credentials'] // 公共客户端不能使用客户端凭证授权
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_client_metadata',
          error_description: expect.stringContaining('Invalid grant type for public client')
        })
      })

      it('应该拒绝未授权的请求', async () => {
        const clientData = {
          name: '测试客户端',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData)

        expect(response.status).toBe(401)
        expect(response.data).toMatchObject({
          error: 'unauthorized',
          error_description: expect.stringContaining('Missing or invalid access token')
        })
      })

      it('应该拒绝权限不足的请求', async () => {
        // 创建权限受限的令牌
        const limitedToken = await dataManager.createAccessToken(
          adminUser.id!,
          'admin-client',
          'admin:read' // 缺少 admin:write 权限
        )

        const clientData = {
          name: '权限测试客户端',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${limitedToken.token}`
          }
        })

        expect(response.status).toBe(403)
        expect(response.data).toMatchObject({
          error: 'insufficient_scope',
          error_description: expect.stringContaining('Insufficient scope')
        })
      })
    })

    describe('🔒 安全验证测试', () => {
      it('应该生成唯一的客户端ID', async () => {
        const clientData = {
          name: '唯一性测试客户端',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }

        const response1 = await httpClient.post('/api/clients', clientData, {
          headers: { 'Authorization': `Bearer ${adminToken.token}` }
        })

        const response2 = await httpClient.post('/api/clients', clientData, {
          headers: { 'Authorization': `Bearer ${adminToken.token}` }
        })

        expect(response1.status).toBe(201)
        expect(response2.status).toBe(201)
        expect(response1.data.clientId).not.toBe(response2.data.clientId)
      })

      it('应该验证作用域的有效性', async () => {
        const clientData = {
          name: '无效作用域客户端',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid', 'invalid_scope', 'dangerous:admin'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_scope',
          error_description: expect.stringContaining('Invalid or unauthorized scope')
        })
      })

      it('应该对客户端名称进行XSS防护', async () => {
        const clientData = {
          name: '<script>alert("XSS")</script>恶意客户端',
          description: '<img src=x onerror=alert(1)>描述',
          clientType: 'public',
          redirectUris: ['https://app.example.com/callback'],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }

        const response = await httpClient.post('/api/clients', clientData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(201)
        // 确保HTML标签被转义或移除
        expect(response.data.name).not.toContain('<script>')
        expect(response.data.description).not.toContain('<img')
      })
    })
  })

  describe('GET /api/clients - 获取客户端列表', () => {
    beforeEach(async () => {
      // 创建一些测试客户端
      await dataManager.createTestClient({
        clientId: 'public-client-1',
        name: '公共客户端1',
        clientType: 'public'
      })

      await dataManager.createTestClient({
        clientId: 'confidential-client-1',
        name: '机密客户端1',
        clientType: 'confidential'
      })

      await dataManager.createTestClient({
        clientId: 'inactive-client-1',
        name: '停用客户端1',
        clientType: 'public',
        status: 'inactive'
      })
    })

    describe('✅ 正常流程测试', () => {
      it('应该返回分页的客户端列表', async () => {
        const response = await httpClient.get('/api/clients?page=1&limit=10', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data).toMatchObject({
          clients: expect.arrayContaining([
            expect.objectContaining({
              clientId: expect.any(String),
              name: expect.any(String),
              clientType: expect.stringMatching(/^(public|confidential)$/),
              status: expect.any(String),
              createdAt: expect.any(String)
            })
          ]),
          pagination: {
            page: 1,
            limit: 10,
            total: expect.any(Number),
            totalPages: expect.any(Number)
          }
        })

        // 敏感信息不应该在列表中返回
        response.data.clients.forEach((client: any) => {
          expect(client).not.toHaveProperty('clientSecret')
        })
      })

      it('应该支持按客户端类型过滤', async () => {
        const response = await httpClient.get('/api/clients?clientType=public', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        response.data.clients.forEach((client: any) => {
          expect(client.clientType).toBe('public')
        })
      })

      it('应该支持按状态过滤', async () => {
        const response = await httpClient.get('/api/clients?status=active', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        response.data.clients.forEach((client: any) => {
          expect(client.status).toBe('active')
        })
      })

      it('应该支持按名称搜索', async () => {
        const response = await httpClient.get('/api/clients?search=公共', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        response.data.clients.forEach((client: any) => {
          expect(client.name).toContain('公共')
        })
      })
    })

    describe('❌ 异常处理测试', () => {
      it('应该拒绝未授权的请求', async () => {
        const response = await httpClient.get('/api/clients')

        expect(response.status).toBe(401)
      })

      it('应该处理无效的分页参数', async () => {
        const response = await httpClient.get('/api/clients?page=-1&limit=0', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_request',
          error_description: expect.stringContaining('Invalid pagination parameters')
        })
      })
    })
  })

  describe('GET /api/clients/{clientId} - 获取客户端详情', () => {
    let testClient: any

    beforeEach(async () => {
      testClient = await dataManager.createTestClient({
        clientId: 'detail-test-client',
        name: '详情测试客户端',
        description: '用于测试客户端详情API的客户端',
        clientType: 'confidential',
        redirectUris: ['https://app.example.com/callback'],
        allowedScopes: ['openid', 'profile', 'email'],
        grants: ['authorization_code', 'refresh_token']
      })
    })

    describe('✅ 正常流程测试', () => {
      it('应该返回完整的客户端详情', async () => {
        const response = await httpClient.get(`/api/clients/${testClient.clientId}`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data).toMatchObject({
          id: testClient.id,
          clientId: testClient.clientId,
          name: testClient.name,
          description: testClient.description,
          clientType: testClient.clientType,
          redirectUris: testClient.redirectUris,
          allowedScopes: testClient.allowedScopes,
          grants: testClient.grants,
          status: 'active',
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })

        // 机密客户端应该返回客户端密钥（在安全的上下文中）
        expect(response.data).toHaveProperty('clientSecret')
      })

      it('应该返回客户端使用统计信息', async () => {
        // 创建一些使用记录
        await dataManager.createAccessToken(
          adminUser.id!,
          testClient.clientId,
          'openid profile'
        )

        const response = await httpClient.get(`/api/clients/${testClient.clientId}?includeStats=true`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data).toHaveProperty('stats')
        expect(response.data.stats).toMatchObject({
          totalUsers: expect.any(Number),
          activeTokens: expect.any(Number),
          lastUsed: expect.any(String)
        })
      })
    })

    describe('❌ 异常处理测试', () => {
      it('应该处理不存在的客户端ID', async () => {
        const response = await httpClient.get('/api/clients/non-existent-client', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(404)
        expect(response.data).toMatchObject({
          error: 'client_not_found',
          error_description: 'Client not found'
        })
      })

      it('应该拒绝未授权的请求', async () => {
        const response = await httpClient.get(`/api/clients/${testClient.clientId}`)

        expect(response.status).toBe(401)
      })
    })
  })

  describe('PUT /api/clients/{clientId} - 更新客户端', () => {
    let testClient: any

    beforeEach(async () => {
      testClient = await dataManager.createTestClient({
        clientId: 'update-test-client',
        name: '更新测试客户端',
        clientType: 'public',
        redirectUris: ['https://app.example.com/callback'],
        allowedScopes: ['openid', 'profile'],
        grants: ['authorization_code']
      })
    })

    describe('✅ 正常流程测试', () => {
      it('应该成功更新客户端信息', async () => {
        const updateData = {
          name: '已更新的测试客户端',
          description: '更新后的描述',
          redirectUris: ['https://app.example.com/callback', 'https://app.example.com/silent-renew'],
          allowedScopes: ['openid', 'profile', 'email']
        }

        const response = await httpClient.put(`/api/clients/${testClient.clientId}`, updateData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data).toMatchObject({
          clientId: testClient.clientId,
          name: updateData.name,
          description: updateData.description,
          redirectUris: updateData.redirectUris,
          allowedScopes: updateData.allowedScopes,
          updatedAt: expect.any(String)
        })
      })

      it('应该支持部分更新', async () => {
        const updateData = {
          name: '部分更新测试'
        }

        const response = await httpClient.put(`/api/clients/${testClient.clientId}`, updateData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data.name).toBe(updateData.name)
        // 其他字段应该保持不变
        expect(response.data.clientType).toBe(testClient.clientType)
        expect(response.data.redirectUris).toEqual(testClient.redirectUris)
      })

      it('应该支持重新生成客户端密钥', async () => {
        // 先将客户端改为机密类型
        await httpClient.put(`/api/clients/${testClient.clientId}`, {
          clientType: 'confidential'
        }, {
          headers: { 'Authorization': `Bearer ${adminToken.token}` }
        })

        const response = await httpClient.put(`/api/clients/${testClient.clientId}/regenerate-secret`, {}, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(200)
        expect(response.data).toHaveProperty('clientSecret')
        expect(response.data.clientSecret).toMatch(/^[a-zA-Z0-9_-]{32,}$/)
      })
    })

    describe('❌ 异常处理测试', () => {
      it('应该拒绝无效的客户端类型更改', async () => {
        const updateData = {
          clientType: 'invalid-type'
        }

        const response = await httpClient.put(`/api/clients/${testClient.clientId}`, updateData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_client_metadata',
          error_description: expect.stringContaining('Invalid client type')
        })
      })

      it('应该防止危险的权限提升', async () => {
        const updateData = {
          allowedScopes: ['openid', 'profile', 'admin:full', 'system:root']
        }

        const response = await httpClient.put(`/api/clients/${testClient.clientId}`, updateData, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          error: 'invalid_scope',
          error_description: expect.stringContaining('Unauthorized scope request')
        })
      })

      it('应该处理不存在的客户端', async () => {
        const response = await httpClient.put('/api/clients/non-existent', { name: 'test' }, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(404)
      })
    })
  })

  describe('DELETE /api/clients/{clientId} - 删除客户端', () => {
    let testClient: any

    beforeEach(async () => {
      testClient = await dataManager.createTestClient({
        clientId: 'delete-test-client',
        name: '删除测试客户端',
        clientType: 'public'
      })
    })

    describe('✅ 正常流程测试', () => {
      it('应该成功删除客户端', async () => {
        const response = await httpClient.delete(`/api/clients/${testClient.clientId}`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(204)

        // 验证客户端已被删除
        const getResponse = await httpClient.get(`/api/clients/${testClient.clientId}`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })
        expect(getResponse.status).toBe(404)
      })

      it('应该在删除客户端时撤销所有相关令牌', async () => {
        // 创建一些令牌
        const accessToken = await dataManager.createAccessToken(
          adminUser.id!,
          testClient.clientId,
          'openid profile'
        )

        await httpClient.delete(`/api/clients/${testClient.clientId}`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        // 验证令牌已被撤销
        const tokenStatus = await dataManager.getAccessTokenStatus(accessToken.token)
        expect(tokenStatus.revoked).toBe(true)
      })
    })

    describe('❌ 异常处理测试', () => {
      it('应该处理不存在的客户端', async () => {
        const response = await httpClient.delete('/api/clients/non-existent', {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(404)
      })

      it('应该拒绝删除有活跃用户的客户端（可选保护）', async () => {
        // 创建活跃令牌
        await dataManager.createAccessToken(
          adminUser.id!,
          testClient.clientId,
          'openid profile'
        )

        const response = await httpClient.delete(`/api/clients/${testClient.clientId}?force=false`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(409)
        expect(response.data).toMatchObject({
          error: 'client_in_use',
          error_description: expect.stringContaining('Client has active tokens'),
          activeTokens: expect.any(Number)
        })
      })

      it('应该支持强制删除有活跃用户的客户端', async () => {
        await dataManager.createAccessToken(
          adminUser.id!,
          testClient.clientId,
          'openid profile'
        )

        const response = await httpClient.delete(`/api/clients/${testClient.clientId}?force=true`, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(204)
      })
    })
  })

  describe('🔒 客户端安全配置测试', () => {
    it('应该验证重定向URI的安全性', async () => {
      const dangerousRedirectUris = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'http://malicious.com/callback',
        'file:///etc/passwd'
      ]

      for (const uri of dangerousRedirectUris) {
        const response = await httpClient.post('/api/clients', {
          name: '危险重定向URI测试',
          clientType: 'public',
          redirectUris: [uri],
          allowedScopes: ['openid'],
          grants: ['authorization_code']
        }, {
          headers: {
            'Authorization': `Bearer ${adminToken.token}`
          }
        })

        expect(response.status).toBe(400)
        expect(response.data.error).toBe('invalid_redirect_uri')
      }
    })

    it('应该对敏感操作进行审计日志记录', async () => {
      const clientData = {
        name: '审计日志测试客户端',
        clientType: 'confidential',
        redirectUris: ['https://app.example.com/callback'],
        allowedScopes: ['openid', 'profile'],
        grants: ['authorization_code']
      }

      const response = await httpClient.post('/api/clients', clientData, {
        headers: {
          'Authorization': `Bearer ${adminToken.token}`
        }
      })

      expect(response.status).toBe(201)

      // 检查审计日志是否记录了创建操作
      const auditLogs = await dataManager.getAuditLogs({
        action: 'client_created',
        clientId: response.data.clientId
      })

      expect(auditLogs).toHaveLength(1)
      expect(auditLogs[0]).toMatchObject({
        action: 'client_created',
        userId: adminUser.id,
        clientId: response.data.clientId,
        timestamp: expect.any(Date)
      })
    })
  })
})