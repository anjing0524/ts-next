// __tests__/lib/auth/authorizationCodeFlow.test.ts
// 单元测试授权码流程函数
// Unit tests for authorization code flow functions.

import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  storeAuthorizationCode,
  validateAuthorizationCode,
  DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS,
  generateSecureRandomString,
} from '../../lib/auth/authorizationCodeFlow';
import {
  ResourceNotFoundError,
  TokenError,
  ValidationError,
  AuthenticationError,
  ConfigurationError,
  BaseError
} from '../../lib/errors'; // 导入自定义错误类 (Import custom error classes)
import { Prisma } from '@prisma/client'; // 导入Prisma错误类型以进行测试 (Import Prisma error types for testing)

// Mock Prisma client
// 模拟 Prisma 客户端
jest.mock('@/lib/prisma', () => ({
  prisma: {
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock generateSecureRandomString for predictable codes in tests
// 为测试中的可预测代码模拟 generateSecureRandomString
jest.mock('../../lib/auth/authorizationCodeFlow', () => {
  const originalModule = jest.requireActual('../../lib/auth/authorizationCodeFlow');
  return {
    ...originalModule,
    generateSecureRandomString: jest.fn(() => 'mocked-secure-random-string-for-code'),
  };
});


// Helper to generate PKCE challenge
// 辅助函数生成PKCE质询
const generateChallenge = (verifier: string): string => {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
};

describe('Authorization Code Flow', () => {
  const testUserId = 'user-test-id-auth-code'; // 确保测试ID的唯一性 (Ensure test ID uniqueness)
  const testClientId = 'client-cuid-for-auth-code'; // 假设这是OAuthClient的CUID (Assuming this is OAuthClient CUID)
  const testRedirectUri = 'https://example.com/callback';
  const testCodeVerifier = 'test-code-verifier-long-enough-for-s256-pkce-and-more-chars';
  const testCodeChallenge = generateChallenge(testCodeVerifier);
  const testCodeChallengeMethod = 'S256'; // 假设 storeAuthorizationCode 内部会验证或强制此方法 (Assume storeAuthorizationCode verifies or enforces this)
  const testScope = 'openid profile email';
  const mockedGeneratedCode = 'mocked-secure-random-string-for-code';

  beforeEach(() => {
    // 在每个测试前重置所有 mock
    // Reset all mocks before each test
    jest.clearAllMocks();
    // 确保我们的 mocked generateSecureRandomString 用于每个相关测试
    // Ensure our mocked generateSecureRandomString is used for each relevant test
    (generateSecureRandomString as jest.Mock).mockReturnValue(mockedGeneratedCode);
  });

  describe('storeAuthorizationCode', () => {
    it('应成功存储授权码并返回代码数据 // Should successfully store authorization code and return code data', async () => {
      const mockExpectedCode = mockedGeneratedCode;
      const mockStoredCode = {
        id: 'mock-db-id',
        code: mockExpectedCode,
        userId: testUserId,
        clientId: testClientId, // 应该是OAuthClient的CUID (Should be OAuthClient CUID)
        redirectUri: testRedirectUri,
        scope: testScope,
        expiresAt: expect.any(Date),
        isUsed: false,
        codeChallenge: testCodeChallenge,
        codeChallengeMethod: testCodeChallengeMethod,
        nonce: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.authorizationCode.create as jest.Mock).mockResolvedValue(mockStoredCode);

      const result = await storeAuthorizationCode(
        testUserId,
        testClientId,
        testRedirectUri,
        testCodeChallenge,
        testCodeChallengeMethod, // 传递 'S256'
        testScope,
        DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS,
        'test-nonce'
      );

      expect(prisma.authorizationCode.create).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.authorizationCode.create as jest.Mock).mock.calls[0][0].data;

      expect(createArgs.code).toBe(mockExpectedCode);
      expect(createArgs.userId).toBe(testUserId);
      expect(createArgs.clientId).toBe(testClientId);
      expect(createArgs.redirectUri).toBe(testRedirectUri);
      expect(createArgs.scope).toBe(testScope);
      expect(createArgs.codeChallenge).toBe(testCodeChallenge);
      expect(createArgs.codeChallengeMethod).toBe(testCodeChallengeMethod);
      expect(createArgs.isUsed).toBe(false);
      expect(createArgs.nonce).toBe('test-nonce');

      const now = Date.now();
      const expectedExpiresAtTimestamp = now + DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS * 1000;
      expect(createArgs.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiresAtTimestamp - 5000);
      expect(createArgs.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiresAtTimestamp + 5000);

      expect(result).toEqual(mockStoredCode);
    });

    it('如果 codeChallengeMethod 不是 S256，则应抛出 ConfigurationError // Should throw ConfigurationError if codeChallengeMethod is not S256', async () => {
      await expect(
        storeAuthorizationCode(
          testUserId, testClientId, testRedirectUri, testCodeChallenge, 'plain', testScope
        )
      ).rejects.toThrow(ConfigurationError); // 验证错误类型 (Verify error type)
      await expect(
        storeAuthorizationCode(
          testUserId, testClientId, testRedirectUri, testCodeChallenge, 'plain', testScope
        )
      ).rejects.toThrow("Unsupported code challenge method: plain. Only 'S256' is supported."); // 验证错误消息 (Verify error message)
      expect(prisma.authorizationCode.create).not.toHaveBeenCalled();
    });

    it('如果 prisma.authorizationCode.create 抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.authorizationCode.create throws an error', async () => {
      const dbError = new Error('Database create error');
      (prisma.authorizationCode.create as jest.Mock).mockRejectedValue(dbError);

      await expect(
        storeAuthorizationCode(
          testUserId, testClientId, testRedirectUri, testCodeChallenge, 'S256', testScope
        )
      ).rejects.toThrow(BaseError); // 验证是否为 BaseError 或其子类 (Verify if it's BaseError or its subclass)
      await expect(
        storeAuthorizationCode(
          testUserId, testClientId, testRedirectUri, testCodeChallenge, 'S256', testScope
        )
      ).rejects.toThrow('Database error while storing authorization code.');
    });
  });

  describe('validateAuthorizationCode', () => {
    const validCodeFromDb = {
      id: 'db-code-id',
      code: mockedGeneratedCode,
      userId: testUserId,
      clientId: testClientId, // 应该是OAuthClient的CUID (Should be OAuthClient CUID)
      redirectUri: testRedirectUri,
      scope: testScope,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      isUsed: false,
      codeChallenge: testCodeChallenge,
      codeChallengeMethod: 'S256',
      nonce: 'test-nonce-from-db',
      createdAt: new Date(Date.now() - 60000),
      updatedAt: new Date(Date.now() - 60000),
    };

    it('应成功验证有效的、未过期的、未使用的代码，并将其标记为已使用 // Should successfully validate a valid, unexpired, unused code and mark it as used', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(validCodeFromDb);
      const updatedCodeInDb = { ...validCodeFromDb, isUsed: true, updatedAt: new Date() };
      (prisma.authorizationCode.update as jest.Mock).mockResolvedValue(updatedCodeInDb);

      const result = await validateAuthorizationCode(
        validCodeFromDb.code,
        testClientId, // 传递 OAuthClient CUID (Pass OAuthClient CUID)
        testRedirectUri,
        testCodeVerifier
      );

      expect(prisma.authorizationCode.findUnique).toHaveBeenCalledWith({
        where: { code: validCodeFromDb.code },
      });
      expect(prisma.authorizationCode.update).toHaveBeenCalledWith({
        where: { id: validCodeFromDb.id },
        data: { isUsed: true },
      });
      expect(result).toEqual(updatedCodeInDb); // 现在返回更新后的记录 (Now returns the updated record)
    });

    it('如果代码未找到，则应抛出 ResourceNotFoundError // Should throw ResourceNotFoundError if code is not found', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        validateAuthorizationCode('non-existent-code', testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(ResourceNotFoundError);
      await expect(
        validateAuthorizationCode('non-existent-code', testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_NOT_FOUND' });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
      expect(prisma.authorizationCode.delete).not.toHaveBeenCalled();
    });

    it('如果代码已被使用，则应抛出 TokenError 并删除代码 // Should throw TokenError and delete code if it has already been used', async () => {
      const usedCode = { ...validCodeFromDb, isUsed: true };
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(usedCode);
      (prisma.authorizationCode.delete as jest.Mock).mockResolvedValue(usedCode);

      await expect(
        validateAuthorizationCode(usedCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(TokenError);
      await expect(
        validateAuthorizationCode(usedCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_USED' });

      expect(prisma.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: usedCode.id } });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果代码已过期，则应抛出 TokenError 并删除代码 // Should throw TokenError and delete code if it has expired', async () => {
      const expiredTimestamp = Date.now() - 1000;
      const expiredCode = { ...validCodeFromDb, expiresAt: new Date(expiredTimestamp) };
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(expiredCode);
      (prisma.authorizationCode.delete as jest.Mock).mockResolvedValue(expiredCode);

      await expect(
        validateAuthorizationCode(expiredCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(TokenError);
      await expect(
        validateAuthorizationCode(expiredCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_EXPIRED' });

      expect(prisma.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: expiredCode.id } });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果 clientId 不匹配，则应抛出 ValidationError // Should throw ValidationError if clientId does not match', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(validCodeFromDb);

      await expect(
        validateAuthorizationCode(validCodeFromDb.code, 'wrong-client-cuid', testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(ValidationError);
      await expect(
        validateAuthorizationCode(validCodeFromDb.code, 'wrong-client-cuid', testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_CLIENT_ID_MISMATCH' });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果 redirectUri 不匹配，则应抛出 ValidationError // Should throw ValidationError if redirectUri does not match', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(validCodeFromDb);

      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, 'https://wrong.uri/callback', testCodeVerifier)
      ).rejects.toThrow(ValidationError);
      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, 'https://wrong.uri/callback', testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_REDIRECT_URI_MISMATCH' });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果 PKCE 验证失败，则应抛出 AuthenticationError // Should throw AuthenticationError if PKCE verification fails', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(validCodeFromDb);

      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, 'wrong-code-verifier-value')
      ).rejects.toThrow(AuthenticationError);
      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, 'wrong-code-verifier-value')
      ).rejects.toMatchObject({ code: 'PKCE_VERIFICATION_FAILED' });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果存储的代码具有不受支持的 codeChallengeMethod，则应抛出 ConfigurationError // Should throw ConfigurationError if stored code has unsupported codeChallengeMethod', async () => {
      const codeWithUnsupportedMethod = { ...validCodeFromDb, codeChallengeMethod: 'plain' };
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(codeWithUnsupportedMethod);

      await expect(
        validateAuthorizationCode(codeWithUnsupportedMethod.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(ConfigurationError);
      await expect(
        validateAuthorizationCode(codeWithUnsupportedMethod.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_STORED_CHALLENGE_METHOD' });
      expect(prisma.authorizationCode.update).not.toHaveBeenCalled();
    });

    it('如果 prisma.authorizationCode.findUnique 抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.authorizationCode.findUnique throws', async () => {
      const dbError = new Error('DB findUnique error');
      (prisma.authorizationCode.findUnique as jest.Mock).mockRejectedValue(dbError);

      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(BaseError); // 验证是否为 BaseError 或其子类 (Verify if it's BaseError or its subclass)
      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow('Database error during authorization code validation.');
    });

    it('如果 prisma.authorizationCode.update 抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.authorizationCode.update throws', async () => {
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(validCodeFromDb);
      const dbError = new Error('DB update error');
      (prisma.authorizationCode.update as jest.Mock).mockRejectedValue(dbError);

      await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(BaseError);
       await expect(
        validateAuthorizationCode(validCodeFromDb.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow('Database error during authorization code validation.');
    });

    it('如果 prisma.authorizationCode.delete 在代码过期时抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.authorizationCode.delete throws when code is expired', async () => {
      const expiredCode = { ...validCodeFromDb, expiresAt: new Date(Date.now() - 1000) };
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(expiredCode);
      const dbDeleteError = new Error('DB delete error');
      (prisma.authorizationCode.delete as jest.Mock).mockRejectedValue(dbDeleteError);

      // 错误仍然是 TokenError，因为这是在删除之前检测到的
      // The error is still TokenError because this is detected before delete
      await expect(
        validateAuthorizationCode(expiredCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(TokenError); // 仍然是 TokenError，因为过期检查优先
      await expect(
        validateAuthorizationCode(expiredCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_EXPIRED' });

      // 确保 delete 仍然被调用 (即使它失败)
      // Ensure delete was still called (even if it fails)
      expect(prisma.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: expiredCode.id } });
    });

     it('如果 prisma.authorizationCode.delete 在代码已使用时抛出错误，则应抛出 BaseError // Should throw BaseError if prisma.authorizationCode.delete throws when code is used', async () => {
      const usedCode = { ...validCodeFromDb, isUsed: true };
      (prisma.authorizationCode.findUnique as jest.Mock).mockResolvedValue(usedCode);
      const dbDeleteError = new Error('DB delete error on used code');
      (prisma.authorizationCode.delete as jest.Mock).mockRejectedValue(dbDeleteError);

      await expect(
        validateAuthorizationCode(usedCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toThrow(TokenError); // 仍然是 TokenError，因为已使用检查优先
       await expect(
        validateAuthorizationCode(usedCode.code, testClientId, testRedirectUri, testCodeVerifier)
      ).rejects.toMatchObject({ code: 'AUTH_CODE_USED' });
      expect(prisma.authorizationCode.delete).toHaveBeenCalledWith({ where: { id: usedCode.id } });
    });
  });
});
