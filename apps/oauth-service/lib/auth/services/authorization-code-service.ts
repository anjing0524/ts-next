/**
 * 授权码服务
 * 封装授权码相关的所有操作
 */

import { 
  PrismaClient, 
  OAuthClient, 
  AuthorizationCode as PrismaAuthorizationCode 
} from '@repo/database';
import { ServiceContainer } from '../service-container';
import { addSeconds } from 'date-fns';
import crypto from 'crypto';
import {
  BaseError,
  ResourceNotFoundError,
  ValidationError,
  AuthenticationError,
  CryptoError,
  TokenValidationError,
  TokenExpiredError,
} from '@repo/lib/node';

/**
 * 授权码数据接口
 */
export interface AuthorizationCodeData {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: Date;
  nonce?: string;
}

/**
 * 授权码服务类
 */
export class AuthorizationCodeService {
  private prisma: PrismaClient;
  
  constructor(private container: ServiceContainer) {
    this.prisma = container.prisma;
  }

  /**
   * 生成安全的随机字符串
   */
  private generateSecureRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 存储授权码
   */
  async storeAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    scope: string,
    expiresInSeconds: number = 600,
    nonce?: string
  ): Promise<PrismaAuthorizationCode> {
    // 验证 codeChallengeMethod
    if (codeChallengeMethod !== 'S256') {
      throw new ValidationError(
        `Unsupported code challenge method: ${codeChallengeMethod}. Only 'S256' is supported.`,
        { codeChallengeMethod },
        'UNSUPPORTED_CHALLENGE_METHOD'
      );
    }

    const generatedCode = this.generateSecureRandomString(32);
    const expiresAt = addSeconds(new Date(), expiresInSeconds);

    try {
      const storedCode = await this.prisma.authorizationCode.create({
        data: {
          code: generatedCode,
          userId,
          clientId,
          redirectUri,
          scope,
          codeChallenge,
          codeChallengeMethod,
          expiresAt,
          isUsed: false,
          nonce: nonce || null,
        },
      });
      return storedCode;
    } catch (error) {
      console.error('Failed to store authorization code:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CryptoError('Database error while storing authorization code.', {
        originalError: errorMessage,
      });
    }
  }

  /**
   * 验证授权码
   */
  async validateAuthorizationCode(
    code: string,
    expectedClientId: string,
    expectedRedirectUri: string,
    codeVerifier: string
  ): Promise<PrismaAuthorizationCode> {
    let storedCode: PrismaAuthorizationCode | null = null;
    
    try {
      storedCode = await this.prisma.authorizationCode.findUnique({
        where: { code },
      });

      if (!storedCode) {
        throw new ResourceNotFoundError(
          'Invalid authorization code: Code not found.',
          'AUTH_CODE_NOT_FOUND'
        );
      }

      if (storedCode.isUsed) {
        await this.prisma.authorizationCode.delete({ where: { id: storedCode.id } });
        throw new TokenValidationError(
          'Invalid authorization code: Code has already been used.',
          { code: code },
          'AUTH_CODE_USED'
        );
      }

      if (storedCode.expiresAt < new Date()) {
        await this.prisma.authorizationCode.delete({ where: { id: storedCode.id } });
        throw new TokenExpiredError('Invalid authorization code: Code has expired.', {
          code: code,
          expiresAt: storedCode.expiresAt,
        });
      }

      if (storedCode.clientId !== expectedClientId) {
        throw new ValidationError(
          'Invalid authorization code: Client ID mismatch.',
          { expected: expectedClientId, actual: storedCode.clientId },
          'AUTH_CODE_CLIENT_ID_MISMATCH'
        );
      }

      if (storedCode.redirectUri !== expectedRedirectUri) {
        throw new ValidationError(
          'Invalid authorization code: Redirect URI mismatch.',
          { expected: expectedRedirectUri, actual: storedCode.redirectUri },
          'AUTH_CODE_REDIRECT_URI_MISMATCH'
        );
      }

      // PKCE 验证
      if (storedCode.codeChallengeMethod === 'S256') {
        const hashedVerifier = crypto.createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
        
        if (hashedVerifier !== storedCode.codeChallenge) {
          throw new AuthenticationError(
            'Invalid authorization code: PKCE verification failed.',
            undefined,
            'PKCE_VERIFICATION_FAILED'
          );
        }
      } else {
        throw new ValidationError(
          `Unsupported code challenge method in stored code: ${storedCode.codeChallengeMethod}. Only 'S256' is supported.`,
          { storedMethod: storedCode.codeChallengeMethod },
          'UNSUPPORTED_STORED_CHALLENGE_METHOD'
        );
      }

      // 标记为已使用
      const updatedCode = await this.prisma.authorizationCode.update({
        where: { id: storedCode.id },
        data: { isUsed: true },
      });

      return updatedCode;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      console.error('Error during authorization code validation:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CryptoError('Database error during authorization code validation.', {
        originalError: errorMessage,
      });
    }
  }

  /**
   * 清理过期的授权码
   */
  async cleanupExpiredCodes(): Promise<number> {
    try {
      const result = await this.prisma.authorizationCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isUsed: true }
          ]
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired authorization codes:', error);
      throw error;
    }
  }

  /**
   * 获取授权码信息
   */
  async getAuthorizationCode(code: string): Promise<PrismaAuthorizationCode | null> {
    return this.prisma.authorizationCode.findUnique({
      where: { code },
    });
  }

  /**
   * 删除授权码
   */
  async deleteAuthorizationCode(code: string): Promise<void> {
    await this.prisma.authorizationCode.deleteMany({
      where: { code }
    });
  }

  /**
   * 批量删除用户的授权码
   */
  async deleteAuthorizationCodesByUser(userId: string): Promise<number> {
    const result = await this.prisma.authorizationCode.deleteMany({
      where: { userId }
    });
    return result.count;
  }

  /**
   * 批量删除客户端的授权码
   */
  async deleteAuthorizationCodesByClient(clientId: string): Promise<number> {
    const result = await this.prisma.authorizationCode.deleteMany({
      where: { clientId }
    });
    return result.count;
  }
}