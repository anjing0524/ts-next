// Jest globals are available without explicit import in our setup
import { JWTUtils } from '@repo/lib';
import { prisma } from '@repo/database';
import type { User, OAuthClient } from '@prisma/client';

describe('JWTUtils', () => {
  let testUser: User;
  let testClient: OAuthClient;

  beforeAll(async () => {
    // 创建测试用户
    testUser = await prisma.user.create({
      data: {
        username: 'test-jwt-user',
        firstName: 'Test',
        lastName: 'JWT',
        passwordHash: 'test-hash', // 添加必需的passwordHash字段
      },
    });

    // 创建测试客户端
    testClient = await prisma.oAuthClient.create({
      data: {
        name: 'test-jwt-client',
        clientId: 'test-jwt-client-id',
        clientType: 'CONFIDENTIAL',
        redirectUris: JSON.stringify(['https://example.com/callback']),
        grantTypes: JSON.stringify(['authorization_code', 'refresh_token']),
        responseTypes: JSON.stringify(['code']),
        scopes: JSON.stringify(['read', 'write']),
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.accessToken.deleteMany({
      where: { clientId: testClient.id },
    });
    await prisma.refreshToken.deleteMany({
      where: { clientId: testClient.id },
    });
    await prisma.oAuthClient.deleteMany({
      where: { id: testClient.id },
    });
    await prisma.user.deleteMany({
      where: { id: testUser.id },
    });
  });

  describe('createAccessToken', () => {
    it('应该创建有效的访问令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'read write',
        permissions: ['read:data', 'write:data'],
      };

      const token = await JWTUtils.createAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT应该有3个部分
    });

    it('应该创建不包含用户的客户端凭据令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        scope: 'read',
        permissions: [],
      };

      const token = await JWTUtils.createAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('createRefreshToken', () => {
    it('应该创建有效的刷新令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'read write',
      };

      const token = await JWTUtils.createRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('createIdToken', () => {
    it('应该创建有效的ID令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'openid profile',
        nonce: 'test-nonce',
      };

      const token = await JWTUtils.createIdToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('应该在没有openid scope时抛出错误', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'read write', // 没有openid
      };

      await expect(
        JWTUtils.createIdToken(payload)
      ).rejects.toThrow();
    });
  });

  describe('verifyAccessToken', () => {
    it('应该验证有效的访问令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'read write',
        permissions: ['read:data'],
      };

      const token = await JWTUtils.createAccessToken(payload);
      const verification = await JWTUtils.verifyAccessToken(token);

      expect(verification.valid).toBe(true);
      expect(verification.payload).toBeDefined();
      expect(verification.payload?.client_id).toBe(testClient.clientId);
      expect(verification.payload?.user_id).toBe(testUser.id);
    });

    it('应该拒绝无效的令牌', async () => {
      const invalidToken = 'invalid.token.here';
      const verification = await JWTUtils.verifyAccessToken(invalidToken);

      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('应该拒绝过期的令牌', async () => {
      // 这个测试需要模拟过期令牌，或者使用较短的过期时间
      // 由于实际令牌有1小时过期时间，这里我们模拟验证过期令牌的行为
      const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.signature';
      const verification = await JWTUtils.verifyAccessToken(expiredToken);

      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('expired');
    });
  });

  describe('verifyRefreshToken', () => {
    it('应该验证有效的刷新令牌', async () => {
      const payload = {
        client_id: testClient.clientId,
        user_id: testUser.id,
        scope: 'read write',
      };

      const token = await JWTUtils.createRefreshToken(payload);
      const verification = await JWTUtils.verifyRefreshToken(token);

      expect(verification.valid).toBe(true);
      expect(verification.payload).toBeDefined();
      expect(verification.payload?.client_id).toBe(testClient.clientId);
    });
  });

  describe('getTokenHash', () => {
    it('应该为相同的令牌生成相同的哈希', () => {
      const token = 'test-token-value';
      const hash1 = JWTUtils.getTokenHash(token);
      const hash2 = JWTUtils.getTokenHash(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeDefined();
      expect(typeof hash1).toBe('string');
    });

    it('应该为不同的令牌生成不同的哈希', () => {
      const token1 = 'test-token-1';
      const token2 = 'test-token-2';
      const hash1 = JWTUtils.getTokenHash(token1);
      const hash2 = JWTUtils.getTokenHash(token2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('应该从Bearer头中提取令牌', () => {
      const authHeader = 'Bearer test-token-value';
      const token = JWTUtils.extractTokenFromHeader(authHeader);

      expect(token).toBe('test-token-value');
    });

    it('应该在无效格式时返回null', () => {
      const invalidHeaders = [
        'Basic dGVzdA==',
        'Bearer',
        'test-token-value',
        '',
      ];

      invalidHeaders.forEach(header => {
        const token = JWTUtils.extractTokenFromHeader(header);
        expect(token).toBeNull();
      });
    });
  });

  describe('错误处理', () => {
    it('应该处理JWT签名错误', async () => {
      // 模拟环境变量缺失的情况
      const originalKey = process.env.JWT_PRIVATE_KEY_PEM;
      delete process.env.JWT_PRIVATE_KEY_PEM;

      await expect(
        JWTUtils.createAccessToken({
          client_id: testClient.clientId,
          scope: 'read',
          permissions: [],
        })
      ).rejects.toThrow();

      // 恢复环境变量
      if (originalKey) {
        process.env.JWT_PRIVATE_KEY_PEM = originalKey;
      }
    });
  });
}); 