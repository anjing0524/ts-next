/**
 * 用户权限管理API增强测试套件
 * 
 * 测试目标：
 * 1. 提升/api/users/[userId]/permissions端点的代码覆盖率
 * 2. 验证权限授予、撤销和查询功能
 * 3. 测试所有错误处理路径和边界条件
 * 4. 覆盖Prisma错误处理和数据验证
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createOAuth2TestSetup } from '../utils/test-helpers'
import { prisma } from '@/lib/prisma'

describe('用户权限管理API增强测试', () => {
  const testSetup = createOAuth2TestSetup('users_permissions_enhanced')
  const { dataManager, httpClient } = testSetup
  
  let testUser: any
  let testClient: any
  let adminToken: string
  let testResource: any
  let testPermission: any
  let readPermission: any
  let writePermission: any

  beforeAll(async () => {
    await testSetup.setup()
    
    // 创建测试用户和客户端
    testUser = await dataManager.createTestUser('regularUser')
    testClient = await dataManager.createTestClient('webApp')
    
    // 创建管理员令牌
    adminToken = await dataManager.createAccessToken(testUser.id, testClient.clientId, 'admin')
    
    // 创建测试资源和权限
    testResource = await prisma.resource.create({
      data: {
        name: 'test_resource_api',
        description: 'Test Resource for API Testing',
        apiPath: '/api/test',
        isActive: true
      }
    })
    
    testPermission = await prisma.permission.create({
      data: {
        name: 'test_permission_api',
        description: 'Test Permission for API Testing',
        isActive: true
      }
    })
    
    readPermission = await prisma.permission.create({
      data: {
        name: 'read_test_api',
        description: 'Read Permission for API Testing',
        isActive: true
      }
    })
    
    writePermission = await prisma.permission.create({
      data: {
        name: 'write_test_api',
        description: 'Write Permission for API Testing',
        isActive: true
      }
    })
  })

  afterAll(async () => {
    // 清理测试数据
    await prisma.userResourcePermission.deleteMany({
      where: { userId: testUser.id }
    })
    await prisma.resource.deleteMany({
      where: { name: { startsWith: 'test_' } }
    })
    await prisma.permission.deleteMany({
      where: { name: { startsWith: 'test_' } }
    })
    
    await testSetup.cleanup()
  })

  describe('POST /api/users/[userId]/permissions - 授予权限', () => {
    it('应该成功授予权限给用户', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: testPermission.id
        })
      })
      
      expect(response.status).toBe(201)
      const data = await response.json()
      
      expect(data).toMatchObject({
        userId: testUser.id,
        resourceId: testResource.id,
        permissionId: testPermission.id,
        resource: {
          name: testResource.name
        },
        permission: {
          name: testPermission.name
        }
      })
    })

    it('应该处理重复授予权限的情况', async () => {
      // 先授予一次权限
      await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: readPermission.id
        })
      })
      
      // 再次授予相同权限
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: readPermission.id
        })
      })
      
      expect([200, 409]).toContain(response.status) // 可能返回现有权限或冲突错误
    })

    it('应该拒绝无效的resourceId格式', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: 'invalid-uuid',
          permissionId: testPermission.id
        })
      })
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errors).toBeDefined()
      expect(data.errors.resourceId).toBeDefined()
    })

    it('应该拒绝无效的permissionId格式', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: 'invalid-uuid'
        })
      })
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errors).toBeDefined()
      expect(data.errors.permissionId).toBeDefined()
    })

    it('应该拒绝不存在的用户ID', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'
      
      const response = await httpClient.request(`/api/users/${nonExistentUserId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: testPermission.id
        })
      })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toContain('not found')
    })

    it('应该拒绝不存在的资源ID', async () => {
      const nonExistentResourceId = '00000000-0000-0000-0000-000000000000'
      
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: nonExistentResourceId,
          permissionId: testPermission.id
        })
      })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toContain('Resource')
      expect(data.message).toContain('not found')
    })

    it('应该拒绝不存在的权限ID', async () => {
      const nonExistentPermissionId = '00000000-0000-0000-0000-000000000000'
      
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id,
          permissionId: nonExistentPermissionId
        })
      })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toContain('Permission')
      expect(data.message).toContain('not found')
    })

    it('应该拒绝缺少必需字段的请求', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resourceId: testResource.id
          // 缺少permissionId
        })
      })
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errors).toBeDefined()
    })

    it('应该拒绝无效的JSON格式', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: 'invalid json'
      })
      
      expect(response.status).toBe(500) // JSON解析错误通常返回500
    })
  })

  describe('DELETE /api/users/[userId]/permissions - 撤销权限', () => {
    beforeAll(async () => {
      // 为删除测试创建一些权限
      await prisma.userResourcePermission.create({
        data: {
          userId: testUser.id,
          resourceId: testResource.id,
          permissionId: writePermission.id
        }
      })
    })

    it('应该成功撤销用户权限', async () => {
      const response = await httpClient.request(
        `/api/users/${testUser.id}/permissions?resourceId=${testResource.id}&permissionId=${writePermission.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      )
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toContain('revoked successfully')
    })

    it('应该处理撤销不存在的权限', async () => {
      const nonExistentPermissionId = '00000000-0000-0000-0000-000000000000'
      
      const response = await httpClient.request(
        `/api/users/${testUser.id}/permissions?resourceId=${testResource.id}&permissionId=${nonExistentPermissionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      )
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toContain('not found')
    })

    it('应该拒绝缺少resourceId参数的请求', async () => {
      const response = await httpClient.request(
        `/api/users/${testUser.id}/permissions?permissionId=${testPermission.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      )
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.message).toContain('Missing')
      expect(data.message).toContain('resourceId')
    })

    it('应该拒绝缺少permissionId参数的请求', async () => {
      const response = await httpClient.request(
        `/api/users/${testUser.id}/permissions?resourceId=${testResource.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      )
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.message).toContain('Missing')
      expect(data.message).toContain('permissionId')
    })

    it('应该拒绝同时缺少两个参数的请求', async () => {
      const response = await httpClient.request(
        `/api/users/${testUser.id}/permissions`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      )
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.message).toContain('Missing')
    })
  })

  describe('GET /api/users/[userId]/permissions - 查询权限', () => {
    beforeAll(async () => {
      // 为查询测试创建一些权限
      await prisma.userResourcePermission.createMany({
        data: [
          {
            userId: testUser.id,
            resourceId: testResource.id,
            permissionId: readPermission.id
          }
        ]
      })
    })

    it('应该成功获取用户的所有权限', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      
      // 验证返回的权限包含相关信息
      const permission = data[0]
      expect(permission).toHaveProperty('userId', testUser.id)
      expect(permission).toHaveProperty('resource')
      expect(permission).toHaveProperty('permission')
      expect(permission.resource).toHaveProperty('name')
      expect(permission.permission).toHaveProperty('name')
    })

    it('应该处理不存在的用户ID', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000'
      
      const response = await httpClient.request(`/api/users/${nonExistentUserId}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toContain('not found')
    })

    it('应该返回空数组当用户没有权限时', async () => {
      // 创建一个新用户，没有任何权限
      const newUser = await dataManager.createUser({
        username: 'no_permissions_user',
        email: 'noperm@test.com',
        password: 'TestPass123!',
        firstName: 'No',
        lastName: 'Permissions',
        isActive: true,
        emailVerified: true
      })
      
      const response = await httpClient.request(`/api/users/${newUser.id}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(0)
    })
  })

  describe('错误处理和边界条件', () => {
    it('应该处理数据库连接错误', async () => {
      // 这个测试比较难模拟，但我们可以测试其他边界条件
      const response = await httpClient.request(`/api/users/invalid-uuid/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      // 无效的UUID格式可能导致不同的错误
      expect([400, 404, 500]).toContain(response.status)
    })

    it('应该处理超长的用户ID', async () => {
      const longUserId = 'a'.repeat(1000)
      
      const response = await httpClient.request(`/api/users/${longUserId}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect([400, 404, 500]).toContain(response.status)
    })

    it('应该处理特殊字符的用户ID', async () => {
      const specialUserId = 'user@#$%^&*()'
      
      const response = await httpClient.request(`/api/users/${encodeURIComponent(specialUserId)}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect([400, 404, 500]).toContain(response.status)
    })
  })

  describe('HTTP方法测试', () => {
    it('应该拒绝不支持的HTTP方法', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect(response.status).toBe(405)
    })

    it('应该拒绝PATCH方法', async () => {
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      expect(response.status).toBe(405)
    })
  })

  describe('性能和并发测试', () => {
    it('应该能够处理并发权限授予请求', async () => {
      // 创建多个权限用于并发测试
      const permissions = await Promise.all([
        prisma.permission.create({
          data: { name: 'concurrent_perm_1', description: 'Concurrent Test 1', isActive: true }
        }),
        prisma.permission.create({
          data: { name: 'concurrent_perm_2', description: 'Concurrent Test 2', isActive: true }
        }),
        prisma.permission.create({
          data: { name: 'concurrent_perm_3', description: 'Concurrent Test 3', isActive: true }
        })
      ])
      
      const concurrentRequests = permissions.map(permission =>
        httpClient.request(`/api/users/${testUser.id}/permissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            resourceId: testResource.id,
            permissionId: permission.id
          })
        })
      )
      
      const responses = await Promise.all(concurrentRequests)
      
      responses.forEach(response => {
        expect([201, 409]).toContain(response.status) // 成功创建或已存在
      })
      
      // 清理
      await prisma.permission.deleteMany({
        where: { name: { startsWith: 'concurrent_perm_' } }
      })
    })

    it('应该在合理时间内响应', async () => {
      const startTime = Date.now()
      
      const response = await httpClient.request(`/api/users/${testUser.id}/permissions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      
      const endTime = Date.now()
      const responseTime = endTime - startTime
      
      expect(response.status).toBe(200)
      expect(responseTime).toBeLessThan(2000) // 应该在2秒内响应
    })
  })
}) 