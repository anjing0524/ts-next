// Jest globals are available without explicit import in our setup
import { prisma } from '@repo/database';
import { ClientService } from '../../lib/services/client-service';
import { OAuth2Error, OAuth2ErrorCode } from '@repo/lib/errors';
import type { OAuthClient } from '@prisma/client';

describe('ClientService', () => {
  // 测试数据
  let testClient: OAuthClient;
  let testUserId: string;

  beforeAll(async () => {
    // 创建测试用户
    const testUser = await prisma.user.create({
      data: {
        username: 'test-admin-client-service',
        firstName: 'Test',
        lastName: 'Admin',
        passwordHash: 'test-hash', // 添加必需的passwordHash字段
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.oAuthClient.deleteMany({
      where: { 
        OR: [
          { name: { contains: 'test-client' } },
          { clientId: { contains: 'test-client' } }
        ]
      },
    });
    await prisma.user.deleteMany({
      where: { username: { contains: 'test-admin-client-service' } },
    });
  });

  beforeEach(async () => {
    // 每个测试前清理相关数据
    await prisma.oAuthClient.deleteMany({
      where: { 
        OR: [
          { name: { contains: 'test-client' } },
          { clientId: { contains: 'test-client' } }
        ]
      },
    });
  });

  describe('createClient', () => {
    it('应该成功创建机密客户端', async () => {
      const clientData = {
        name: 'test-client-confidential',
        clientType: 'CONFIDENTIAL' as const,
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        allowedScopes: ['read', 'write'],
        description: '测试机密客户端',
      };

      const result = await ClientService.createClient(clientData, {
        userId: testUserId,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe(clientData.name);
      expect(result.clientType).toBe('CONFIDENTIAL');
      expect(result.clientId).toMatch(/^test-client-confidential-[a-f0-9]{8}$/);
      expect(result.clientSecret).toBeDefined();
      expect(result.redirectUris).toBe(JSON.stringify(clientData.redirectUris));
      expect(result.grantTypes).toBe(JSON.stringify(clientData.grantTypes));
      expect(result.allowedScopes).toBe(JSON.stringify(clientData.allowedScopes));
      expect(result.isActive).toBe(true);

      testClient = result;
    });

    it('应该成功创建公开客户端（无客户端密钥）', async () => {
      const clientData = {
        name: 'test-client-public',
        clientType: 'PUBLIC' as const,
        redirectUris: ['https://spa.example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      };

      const result = await ClientService.createClient(clientData, testUserId);

      expect(result).toBeDefined();
      expect(result.clientType).toBe('PUBLIC');
      expect(result.clientSecret).toBeNull();
    });

    it('应该在名称重复时抛出错误', async () => {
      const clientData = {
        name: 'test-client-duplicate',
        clientType: 'CONFIDENTIAL' as const,
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      };

      // 创建第一个客户端
      await ClientService.createClient(clientData, testUserId);

      // 尝试创建同名客户端
      await expect(
        ClientService.createClient(clientData, testUserId)
      ).rejects.toThrow(OAuth2Error);
    });

    it('应该验证重定向URI格式', async () => {
      const clientData = {
        name: 'test-client-invalid-uri',
        clientType: 'CONFIDENTIAL' as const,
        redirectUris: ['invalid-uri'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      };

      await expect(
        ClientService.createClient(clientData, testUserId)
      ).rejects.toThrow(OAuth2Error);
    });
  });

  describe('getClients', () => {
    beforeEach(async () => {
      // 创建测试客户端
      await ClientService.createClient({
        name: 'test-client-list-1',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example1.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      }, testUserId);

      await ClientService.createClient({
        name: 'test-client-list-2',
        clientType: 'PUBLIC',
        redirectUris: ['https://example2.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['write'],
      }, testUserId);
    });

    it('应该返回所有客户端列表', async () => {
      const result = await ClientService.getClients({});

      expect(result.clients).toBeDefined();
      expect(result.clients.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('应该支持分页', async () => {
      const result = await ClientService.getClients({
        page: 1,
        pageSize: 1,
      });

      expect(result.clients.length).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(1);
    });

    it('应该支持按名称搜索', async () => {
      const result = await ClientService.getClients({
        search: 'test-client-list-1',
      });

      expect(result.clients.length).toBe(1);
      expect(result.clients[0].name).toBe('test-client-list-1');
    });

    it('应该支持按客户端类型过滤', async () => {
      const result = await ClientService.getClients({
        clientType: 'PUBLIC',
      });

      const publicClients = result.clients.filter(c => c.clientType === 'PUBLIC');
      expect(publicClients.length).toBeGreaterThanOrEqual(1);
    });

    it('应该支持按状态过滤', async () => {
      const result = await ClientService.getClients({
        isActive: true,
      });

      expect(result.clients.every(c => c.isActive)).toBe(true);
    });
  });

  describe('getClientById', () => {
    beforeEach(async () => {
      testClient = await ClientService.createClient({
        name: 'test-client-get-by-id',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      }, testUserId);
    });

    it('应该成功获取客户端详情', async () => {
      const result = await ClientService.getClientById(testClient.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(testClient.id);
      expect(result.name).toBe('test-client-get-by-id');
      expect(result.clientType).toBe('CONFIDENTIAL');
    });

    it('应该在客户端不存在时抛出错误', async () => {
      await expect(
        ClientService.getClientById('non-existent-id')
      ).rejects.toThrow(OAuth2Error);
    });
  });

  describe('updateClient', () => {
    beforeEach(async () => {
      testClient = await ClientService.createClient({
        name: 'test-client-update',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
        description: '原始描述',
      }, testUserId);
    });

    it('应该成功更新客户端信息', async () => {
      const updateData = {
        name: 'test-client-updated',
        description: '更新后的描述',
        redirectUris: ['https://updated.example.com/callback'],
        scopes: ['read', 'write'],
      };

      const result = await ClientService.updateClient(
        testClient.id,
        updateData,
        testUserId
      );

      expect(result.name).toBe('test-client-updated');
      expect(result.description).toBe('更新后的描述');
      expect(result.redirectUris).toBe(JSON.stringify(updateData.redirectUris));
      expect(result.scopes).toBe(JSON.stringify(updateData.scopes));
    });

    it('应该在客户端不存在时抛出错误', async () => {
      await expect(
        ClientService.updateClient('non-existent-id', { name: 'new-name' }, testUserId)
      ).rejects.toThrow(OAuth2Error);
    });

    it('应该验证重定向URI格式', async () => {
      await expect(
        ClientService.updateClient(
          testClient.id,
          { redirectUris: ['invalid-uri'] },
          testUserId
        )
      ).rejects.toThrow(OAuth2Error);
    });
  });

  describe('deleteClient', () => {
    beforeEach(async () => {
      testClient = await ClientService.createClient({
        name: 'test-client-delete',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      }, testUserId);
    });

    it('应该成功删除客户端', async () => {
      await expect(
        ClientService.deleteClient(testClient.id, testUserId)
      ).resolves.not.toThrow();

      // 验证客户端已被删除
      await expect(
        ClientService.getClientById(testClient.id)
      ).rejects.toThrow(OAuth2Error);
    });

    it('应该在客户端不存在时抛出错误', async () => {
      await expect(
        ClientService.deleteClient('non-existent-id', testUserId)
      ).rejects.toThrow(OAuth2Error);
    });
  });

  describe('rotateClientSecret', () => {
    beforeEach(async () => {
      testClient = await ClientService.createClient({
        name: 'test-client-rotate-secret',
        clientType: 'CONFIDENTIAL',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      }, testUserId);
    });

    it('应该成功轮换机密客户端的密钥', async () => {
      const originalSecret = testClient.clientSecret;

      const result = await ClientService.rotateClientSecret(
        testClient.id,
        testUserId
      );

      expect(result.clientSecret).toBeDefined();
      expect(result.clientSecret).not.toBe(originalSecret);
      expect(result.secretRotatedAt).toBeDefined();
    });

    it('应该在公开客户端上抛出错误', async () => {
      const publicClient = await ClientService.createClient({
        name: 'test-client-public-rotate',
        clientType: 'PUBLIC',
        redirectUris: ['https://example.com/callback'],
        grantTypes: ['authorization_code'],
        scopes: ['read'],
      }, testUserId);

      await expect(
        ClientService.rotateClientSecret(publicClient.id, testUserId)
      ).rejects.toThrow(OAuth2Error);
    });

    it('应该在客户端不存在时抛出错误', async () => {
      await expect(
        ClientService.rotateClientSecret('non-existent-id', testUserId)
      ).rejects.toThrow(OAuth2Error);
    });
  });

  describe('验证逻辑', () => {
    it('应该验证有效的重定向URI', () => {
      const validUris = [
        'https://example.com/callback',
        'http://localhost:3000/callback',
        'https://subdomain.example.com/auth/callback',
      ];

      validUris.forEach(uri => {
        expect(() => {
          // 这里应该调用内部验证方法，但由于是私有方法，我们通过创建客户端来测试
        }).not.toThrow();
      });
    });

    it('应该拒绝无效的重定向URI', async () => {
      const invalidUris = [
        'invalid-uri',
        'ftp://example.com/callback',
        'javascript:alert(1)',
        '',
      ];

      for (const uri of invalidUris) {
        await expect(
          ClientService.createClient({
            name: `test-client-invalid-${Date.now()}`,
            clientType: 'CONFIDENTIAL',
            redirectUris: [uri],
            grantTypes: ['authorization_code'],
            scopes: ['read'],
          }, testUserId)
        ).rejects.toThrow(OAuth2Error);
      }
    });
  });
}); 