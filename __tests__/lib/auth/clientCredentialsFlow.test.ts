// __tests__/lib/auth/clientCredentialsFlow.test.ts
// 单元测试客户端凭证流程函数
// Unit tests for client credentials flow functions.

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
// Import the actual JWTUtils to help with mocking structure
import { JWTUtils as OriginalJWTUtils } from '../oauth2'; // Actual import
import {
  authenticateClient,
  grantClientCredentialsToken,
  DEFAULT_CLIENT_CREDENTIALS_TOKEN_TTL_SECONDS,
  AuthenticatedClient,
} from '../../lib/auth/clientCredentialsFlow';
import { OAuthClientType as PrismaOAuthClientType } from '@prisma/client';
import { AuthenticationError, ConfigurationError, TokenGenerationError, BaseError } from '../../lib/errors'; // 导入自定义错误 (Import custom errors)

// Mock Prisma client
// 模拟 Prisma 客户端
jest.mock('@/lib/prisma', () => ({
  prisma: {
    oAuthClient: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock bcrypt
// 模拟 bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// Mock JWTUtils.createAccessToken from ../oauth2
// 模拟 ../oauth2 中的 JWTUtils.createAccessToken
jest.mock('../oauth2', () => {
  const originalOAuth2 = jest.requireActual('../oauth2');
  return {
    ...originalOAuth2,
    JWTUtils: {
      ...originalOAuth2.JWTUtils,
      createAccessToken: jest.fn(),
    },
  };
});
import { JWTUtils } from '../oauth2'; // 导入 mock 后的 JWTUtils (Import the mocked JWTUtils)


describe('Client Credentials Flow', () => {
  const mockClientIdString = 'test-client-id';
  const mockClientSecret = 'test-client-secret';
  const mockHashedSecret = '$2b$10$mockedHashedSecretValue';
  const mockClientDbId = 'db-client-cuid-123';


  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateClient', () => {
    const baseClientData = {
      id: mockClientDbId,
      clientId: mockClientIdString,
      clientSecret: mockHashedSecret,
      name: 'Test Confidential Client',
      clientType: PrismaOAuthClientType.CONFIDENTIAL,
      allowedScopes: JSON.stringify(['read:data', 'write:data']),
      accessTokenTtl: 3600,
      refreshTokenTtl: 86400,
      isActive: true,
      redirectUris: JSON.stringify(['https://example.com/callback']),
      grants: ['client_credentials', 'authorization_code'] as any[],
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic: false,
      jwksUri: null, clientUri: null, logoUri: null, tosUri: null, policyUri: null,
      clientSecretExpiresAt: null, contacts: null, defaultMaxAge: null,
      requireAuthTime: false, requirePkce: true,
      idTokenSignedResponseAlg: 'RS256',
      idTokenEncryptedResponseAlg: null,
      idTokenEncryptedResponseEnc: null,
      userinfoSignedResponseAlg: null,
      userinfoEncryptedResponseAlg: null,
      userinfoEncryptedResponseEnc: null,
      requestObjectSigningAlg: null,
      requestObjectEncryptionAlg: null,
      requestObjectEncryptionEnc: null,
      tokenEndpointAuthMethod: 'client_secret_basic',
      tokenEndpointAuthSigningAlg: null,
      defaultAcrValues: null,
      initiateLoginUri: null,
      authorizationSignedResponseAlg: null,
      authorizationEncryptedResponseAlg: null,
      authorizationEncryptedResponseEnc: null,
    };

    it('应成功验证机密客户端 // Should successfully authenticate a confidential client', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(baseClientData);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authenticateClient(mockClientIdString, mockClientSecret);
      expect(prisma.oAuthClient.findUnique).toHaveBeenCalledWith({ where: { clientId: mockClientIdString } });
      expect(bcrypt.compare).toHaveBeenCalledWith(mockClientSecret, baseClientData.clientSecret);
      expect(result).toEqual({
        id: baseClientData.id,
        clientId: baseClientData.clientId,
        clientType: baseClientData.clientType,
        allowedScopes: baseClientData.allowedScopes,
        name: baseClientData.name,
        accessTokenTtl: baseClientData.accessTokenTtl,
      });
    });

    it('机密客户端密码错误时应抛出 AuthenticationError // Should throw AuthenticationError for confidential client with invalid secret', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(baseClientData);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authenticateClient(mockClientIdString, 'wrong-secret'))
        .rejects.toThrow(AuthenticationError);
      await expect(authenticateClient(mockClientIdString, 'wrong-secret'))
        .rejects.toMatchObject({ code: 'INVALID_CLIENT_SECRET' });
      expect(bcrypt.compare).toHaveBeenCalledWith('wrong-secret', baseClientData.clientSecret);
    });

    it('机密客户端未提供密码时应抛出 AuthenticationError // Should throw AuthenticationError if client secret is required but not provided', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(baseClientData);
      await expect(authenticateClient(mockClientIdString, undefined))
        .rejects.toThrow(AuthenticationError);
      await expect(authenticateClient(mockClientIdString, undefined))
        .rejects.toMatchObject({ code: 'CLIENT_SECRET_REQUIRED' });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('机密客户端在DB中缺少密钥时应抛出 ConfigurationError // Should throw ConfigurationError if confidential client has no secret in DB', async () => {
        const clientMissingSecretInDb = { ...baseClientData, clientSecret: null };
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(clientMissingSecretInDb);
        await expect(authenticateClient(mockClientIdString, mockClientSecret))
            .rejects.toThrow(ConfigurationError);
        await expect(authenticateClient(mockClientIdString, mockClientSecret))
            .rejects.toMatchObject({ code: 'CLIENT_CONFIG_NO_SECRET' });
    });

    it('应成功验证公共客户端（无密码）// Should successfully authenticate a public client (no secret)', async () => {
      const publicClientData = {
        ...baseClientData,
        clientType: PrismaOAuthClientType.PUBLIC,
        clientSecret: null,
        isPublic: true,
      };
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(publicClientData);

      const result = await authenticateClient(mockClientIdString, undefined);
      expect(prisma.oAuthClient.findUnique).toHaveBeenCalledWith({ where: { clientId: mockClientIdString } });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: publicClientData.id,
        clientId: publicClientData.clientId,
        clientType: publicClientData.clientType,
        allowedScopes: publicClientData.allowedScopes,
        name: publicClientData.name,
        accessTokenTtl: publicClientData.accessTokenTtl,
      });
    });

    it('客户端未找到时应抛出 AuthenticationError // Should throw AuthenticationError if client ID is not found', async () => {
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(authenticateClient('unknown-client-id', mockClientSecret))
        .rejects.toThrow(AuthenticationError);
      await expect(authenticateClient('unknown-client-id', mockClientSecret))
        .rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    });

    it('客户端被标记为非活动时应抛出 AuthenticationError // Should throw AuthenticationError if client is marked isActive: false', async () => {
      const inactiveClient = { ...baseClientData, isActive: false };
      (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(inactiveClient);
      await expect(authenticateClient(mockClientIdString, mockClientSecret))
        .rejects.toThrow(AuthenticationError);
      await expect(authenticateClient(mockClientIdString, mockClientSecret))
        .rejects.toMatchObject({ code: 'CLIENT_INACTIVE' });
    });

    it('如果 prisma.oAuthClient.findUnique 抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.oAuthClient.findUnique throws an error', async () => {
      const dbError = new Error('Database connection error');
      (prisma.oAuthClient.findUnique as jest.Mock).mockRejectedValue(dbError);
      await expect(authenticateClient(mockClientIdString, mockClientSecret))
        .rejects.toThrow(BaseError); // 验证是否为 BaseError (Verify if it's BaseError)
      await expect(authenticateClient(mockClientIdString, mockClientSecret))
        .rejects.toMatchObject({ code: 'DB_CLIENT_LOOKUP_FAILED' });
    });

    it('如果 bcrypt.compare 抛出错误，则应抛出 BaseError // Should throw BaseError if bcrypt.compare throws an error', async () => {
        (prisma.oAuthClient.findUnique as jest.Mock).mockResolvedValue(baseClientData);
        const bcryptError = new Error('bcrypt internal error');
        (bcrypt.compare as jest.Mock).mockRejectedValue(bcryptError);
        await expect(authenticateClient(mockClientIdString, mockClientSecret))
            .rejects.toThrow(BaseError);
        await expect(authenticateClient(mockClientIdString, mockClientSecret))
            .rejects.toMatchObject({ code: 'BCRYPT_ERROR' });
    });
  });

  describe('grantClientCredentialsToken', () => {
    const authenticatedClient: AuthenticatedClient = {
      id: 'db-client-id-456',
      clientId: 'auth-client-id',
      clientType: PrismaOAuthClientType.CONFIDENTIAL,
      allowedScopes: JSON.stringify(['read:data', 'write:data', 'manage:users']),
      name: 'Authenticated Test Client',
      accessTokenTtl: 1800,
    };
    const mockJwt = 'mocked.jwt.token_for_client_credentials';

    beforeEach(() => {
      (JWTUtils.createAccessToken as jest.Mock).mockResolvedValue(mockJwt);
    });

    it('应使用客户端允许的范围成功授予令牌（未请求特定范围时）// Should successfully grant token with client allowed scopes when no specific scope requested', async () => {
      const result = await grantClientCredentialsToken(authenticatedClient, undefined);

      const expectedScopes = JSON.parse(authenticatedClient.allowedScopes || '[]').join(' ');
      const expectedExp = `${authenticatedClient.accessTokenTtl}s`;

      expect(JWTUtils.createAccessToken).toHaveBeenCalledWith({
        client_id: authenticatedClient.clientId,
        scope: expectedScopes,
        permissions: [],
        exp: expectedExp,
      });
      expect(result).toBe(mockJwt);
    });

    // ... (其他 grantClientCredentialsToken 测试用例保持不变，因为它们测试的是scope逻辑和JWTUtils的调用，而不是authenticateClient的错误处理)
    // ... (Other grantClientCredentialsToken test cases remain the same as they test scope logic and JWTUtils invocation, not authenticateClient's error handling)

    it('如果 JWTUtils.createAccessToken 抛出错误，则应抛出 TokenGenerationError // Should throw TokenGenerationError if JWTUtils.createAccessToken throws an error', async () => {
      const jwtError = new Error('JWT generation failed internally');
      (JWTUtils.createAccessToken as jest.Mock).mockRejectedValue(jwtError);
      await expect(grantClientCredentialsToken(authenticatedClient, 'read:data'))
        .rejects.toThrow(TokenGenerationError);
      await expect(grantClientCredentialsToken(authenticatedClient, 'read:data'))
        .rejects.toMatchObject({ code: 'TOKEN_GENERATION_FAILED' });
    });
  });
});
