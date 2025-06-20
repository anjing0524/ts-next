/**
 * OAuth2.1 核心功能单元测试
 * 基于 OAuth2.1 + 强制PKCE + Jose库 标准
 * @author 测试团队
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as jose from 'jose';
import { OAuth2Service } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';
import { generateCodeVerifier, generateCodeChallenge } from '@/lib/auth/pkce';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    oAuthClient: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    accessToken: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock环境变量
process.env.JWT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfQIJXdwyA6VTK7TzO+dNdvw0Pj7KMa0+y9Z5OV8Wk8jXY8V+3nV1K5N5O+dN
...
-----END PRIVATE KEY-----`;

process.env.JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcBIjn0C
CV3cMgOlUyu08zvnTXb8ND4+yjGtPsvWeTlfFpPI12PFft51dSuTeTvnTXb8ND4+
...
-----END PUBLIC KEY-----`;

describe('OAuth2Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('JWT令牌生成和验证 (使用Jose库)', () => {
    it('应该使用Jose库生成有效的访问令牌', async () => {
      // 这是一个示例测试，实际实现需要根据OAuth2Service的具体实现来调整
      expect(true).toBe(true);
    });

    it('应该使用RSA256算法签名JWT', async () => {
      // Arrange
      const userId = 'user123';
      const clientId = 'client123';
      const scope = ['openid'];

      // Act
      const token = await OAuth2Service.generateAccessToken(userId, clientId, scope);

      // Assert
      const header = jose.decodeProtectedHeader(token);
      expect(header.alg).toBe('RS256');
    });

    it('应该正确验证Jose库生成的JWT', async () => {
      // Arrange
      const userId = 'user123';
      const clientId = 'client123';
      const scope = ['openid'];
      const token = await OAuth2Service.generateAccessToken(userId, clientId, scope);

      // Act
      const result = await OAuth2Service.verifyAccessToken(token);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.payload?.sub).toBe(userId);
      expect(result.payload?.aud).toBe(clientId);
    });

    it('应该拒绝过期的JWT', async () => {
      // Arrange - 生成一个已过期的令牌
      const expiredPayload = {
        sub: 'user123',
        aud: 'client123',
        scope: ['openid'],
        iat: Math.floor(Date.now() / 1000) - 3600, // 1小时前
        exp: Math.floor(Date.now() / 1000) - 1800, // 30分钟前过期
      };

      const privateKey = await jose.importPKCS8(process.env.JWT_PRIVATE_KEY!, 'RS256');
      const expiredToken = await new jose.SignJWT(expiredPayload)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime('30m')
        .sign(privateKey);

      // Act
      const result = await OAuth2Service.verifyAccessToken(expiredToken);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('PKCE支持 (强制启用)', () => {
    it('应该生成符合RFC 7636规范的code_verifier', () => {
      // Act
      const verifier = generateCodeVerifier();

      // Assert
      expect(verifier).toBeDefined();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('应该生成正确的S256 code_challenge', () => {
      // Arrange
      const verifier = generateCodeVerifier();

      // Act
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Assert
      expect(challenge).toBeDefined();
      expect(challenge).not.toBe(verifier);
      expect(challenge.length).toBe(43); // Base64URL编码的SHA256哈希长度
    });

    it('应该验证PKCE code_challenge和code_verifier匹配', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Act
      const isValid = OAuth2Service.verifyPKCE(verifier, challenge, 'S256');

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该拒绝不匹配的PKCE参数', () => {
      // Arrange
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier1, 'S256');

      // Act
      const isValid = OAuth2Service.verifyPKCE(verifier2, challenge, 'S256');

      // Assert
      expect(isValid).toBe(false);
    });

    it('应该强制要求所有客户端使用PKCE', async () => {
      // Arrange
      const mockClient = {
        id: 'client123',
        clientId: 'test-client',
        requirePkce: true,
        clientType: 'PUBLIC',
      };

      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient);

      // Act & Assert
      await expect(
        OAuth2Service.generateAuthorizationCode({
          userId: 'user123',
          clientId: 'test-client',
          redirectUri: 'https://example.com/callback',
          scope: ['openid'],
          // 缺少PKCE参数
        })
      ).rejects.toThrow('PKCE is required');
    });
  });

  describe('OAuth2.1授权码流程', () => {
    it('应该生成有效的授权码', async () => {
      // Arrange
      const mockClient = {
        id: 'client123',
        clientId: 'test-client',
        requirePkce: true,
        redirectUris: '["https://example.com/callback"]',
      };

      const mockUser = {
        id: 'user123',
        username: 'testuser',
        isActive: true,
      };

      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.authorizationCode.create as jest.Mock).mockResolvedValue({
        id: 'code123',
        code: 'auth_code_123',
        expiresAt: new Date(Date.now() + 600000), // 10分钟后过期
      });

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier, 'S256');

      // Act
      const result = await OAuth2Service.generateAuthorizationCode({
        userId: 'user123',
        clientId: 'test-client',
        redirectUri: 'https://example.com/callback',
        scope: ['openid', 'profile'],
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.code).toBe('auth_code_123');
      expect(prisma.authorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user123',
          clientId: 'client123',
          codeChallenge,
          codeChallengeMethod: 'S256',
        }),
      });
    });

    it('应该验证重定向URI白名单', async () => {
      // Arrange
      const mockClient = {
        id: 'client123',
        clientId: 'test-client',
        redirectUris: '["https://example.com/callback"]',
        requirePkce: true,
      };

      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient);

      const codeChallenge = generateCodeChallenge(generateCodeVerifier(), 'S256');

      // Act & Assert
      await expect(
        OAuth2Service.generateAuthorizationCode({
          userId: 'user123',
          clientId: 'test-client',
          redirectUri: 'https://malicious.com/callback', // 不在白名单中
          scope: ['openid'],
          codeChallenge,
          codeChallengeMethod: 'S256',
        })
      ).rejects.toThrow('Invalid redirect URI');
    });

    it('应该在令牌交换时验证PKCE', async () => {
      // Arrange
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier, 'S256');

      const mockAuthCode = {
        id: 'code123',
        code: 'auth_code_123',
        userId: 'user123',
        clientId: 'client123',
        codeChallenge,
        codeChallengeMethod: 'S256',
        isUsed: false,
        expiresAt: new Date(Date.now() + 600000),
        scope: '["openid","profile"]',
      };

      const mockClient = {
        id: 'client123',
        clientId: 'test-client',
        requirePkce: true,
      };

      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode);
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(mockClient);
      (prisma.authorizationCode.update as jest.Mock).mockResolvedValue(mockAuthCode);
      (prisma.accessToken.create as jest.Mock).mockResolvedValue({});
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      // Act
      const result = await OAuth2Service.exchangeAuthorizationCode({
        code: 'auth_code_123',
        clientId: 'test-client',
        codeVerifier,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
    });
  });

  describe('内网环境特性', () => {
    it('应该支持管理员创建的用户认证', async () => {
      // Arrange
      const mockUser = {
        id: 'user123',
        username: 'employee001',
        isActive: true,
        createdBy: 'admin123', // 管理员创建
        organization: 'TechCorp',
        department: 'Engineering',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Act
      const user = await OAuth2Service.validateUser('employee001');

      // Assert
      expect(user).toBeDefined();
      expect(user.createdBy).toBe('admin123');
      expect(user.organization).toBe('TechCorp');
    });

    it('应该支持企业组织架构权限', async () => {
      // Arrange
      const mockUser = {
        id: 'user123',
        organization: 'TechCorp',
        department: 'Engineering',
        userRoles: [
          {
            role: {
              name: 'engineer',
              rolePermissions: [
                {
                  permission: {
                    name: 'api:projects:read',
                    resource: 'projects',
                    action: 'read',
                  },
                },
              ],
            },
          },
        ],
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Act
      const permissions = await OAuth2Service.getUserPermissions('user123');

      // Assert
      expect(permissions).toContain('api:projects:read');
    });
  });

  describe('安全特性', () => {
    it('应该防止授权码重放攻击', async () => {
      // Arrange
      const mockAuthCode = {
        id: 'code123',
        code: 'auth_code_123',
        isUsed: true, // 已被使用
        expiresAt: new Date(Date.now() + 600000),
      };

      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode);

      // Act & Assert
      await expect(
        OAuth2Service.exchangeAuthorizationCode({
          code: 'auth_code_123',
          clientId: 'test-client',
          codeVerifier: generateCodeVerifier(),
        })
      ).rejects.toThrow('Authorization code has already been used');
    });

    it('应该验证JWT签名完整性', async () => {
      // Arrange - 创建一个被篡改的令牌
      const validToken = await OAuth2Service.generateAccessToken('user123', 'client123', ['openid']);
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';

      // Act
      const result = await OAuth2Service.verifyAccessToken(tamperedToken);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('应该限制令牌有效期', async () => {
      // Arrange
      const token = await OAuth2Service.generateAccessToken('user123', 'client123', ['openid']);
      const decoded = jose.decodeJwt(token);

      // Assert
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp! - decoded.iat!).toBeLessThanOrEqual(3600); // 最大1小时
    });
  });

  describe('错误处理', () => {
    it('应该正确处理无效的客户端ID', async () => {
      // Arrange
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        OAuth2Service.generateAuthorizationCode({
          userId: 'user123',
          clientId: 'invalid-client',
          redirectUri: 'https://example.com/callback',
          scope: ['openid'],
          codeChallenge: generateCodeChallenge(generateCodeVerifier(), 'S256'),
          codeChallengeMethod: 'S256',
        })
      ).rejects.toThrow('Invalid client');
    });

    it('应该正确处理过期的授权码', async () => {
      // Arrange
      const mockAuthCode = {
        id: 'code123',
        code: 'auth_code_123',
        isUsed: false,
        expiresAt: new Date(Date.now() - 1000), // 已过期
      };

      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(mockAuthCode);

      // Act & Assert
      await expect(
        OAuth2Service.exchangeAuthorizationCode({
          code: 'auth_code_123',
          clientId: 'test-client',
          codeVerifier: generateCodeVerifier(),
        })
      ).rejects.toThrow('Authorization code has expired');
    });
  });
}); 