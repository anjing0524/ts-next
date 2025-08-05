/**
 * 清理服务 - 定期清理过期的授权码和令牌
 * 支持手动触发和定时任务
 */

import { prisma } from '@repo/database';

/**
 * 清理结果接口
 */
export interface CleanupResult {
  authorizationCodesDeleted: number;
  accessTokensDeleted: number;
  refreshTokensDeleted: number;
  passwordResetRequestsDeleted: number;
  revokedAuthJtisDeleted: number;
  tokenBlacklistDeleted: number;
  error?: string;
}

/**
 * 清理服务类
 */
export class CleanupService {
  /**
   * 清理过期的授权码
   */
  private static async cleanupExpiredAuthorizationCodes(): Promise<number> {
    try {
      const result = await prisma.authorizationCode.deleteMany({
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
   * 清理过期的访问令牌
   */
  private static async cleanupExpiredAccessTokens(): Promise<number> {
    try {
      const result = await prisma.accessToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired access tokens:', error);
      throw error;
    }
  }

  /**
   * 清理过期的刷新令牌
   */
  private static async cleanupExpiredRefreshTokens(): Promise<number> {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isRevoked: true }
          ]
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired refresh tokens:', error);
      throw error;
    }
  }

  /**
   * 清理过期的密码重置请求
   */
  private static async cleanupExpiredPasswordResetRequests(): Promise<number> {
    try {
      const result = await prisma.passwordResetRequest.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isUsed: true }
          ]
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired password reset requests:', error);
      throw error;
    }
  }

  /**
   * 清理过期的撤销认证JTI
   */
  private static async cleanupExpiredRevokedAuthJtis(): Promise<number> {
    try {
      const result = await prisma.revokedAuthJti.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired revoked auth jtis:', error);
      throw error;
    }
  }

  /**
   * 清理过期的令牌黑名单
   */
  private static async cleanupExpiredTokenBlacklist(): Promise<number> {
    try {
      const result = await prisma.tokenBlacklist.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired token blacklist:', error);
      throw error;
    }
  }

  /**
   * 执行完整的清理操作
   */
  static async performCleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      authorizationCodesDeleted: 0,
      accessTokensDeleted: 0,
      refreshTokensDeleted: 0,
      passwordResetRequestsDeleted: 0,
      revokedAuthJtisDeleted: 0,
      tokenBlacklistDeleted: 0
    };

    try {
      console.log('[CleanupService] Starting cleanup process...');
      const startTime = Date.now();

      // 并行执行所有清理操作
      const [
        authorizationCodesDeleted,
        accessTokensDeleted,
        refreshTokensDeleted,
        passwordResetRequestsDeleted,
        revokedAuthJtisDeleted,
        tokenBlacklistDeleted
      ] = await Promise.all([
        this.cleanupExpiredAuthorizationCodes(),
        this.cleanupExpiredAccessTokens(),
        this.cleanupExpiredRefreshTokens(),
        this.cleanupExpiredPasswordResetRequests(),
        this.cleanupExpiredRevokedAuthJtis(),
        this.cleanupExpiredTokenBlacklist()
      ]);

      result.authorizationCodesDeleted = authorizationCodesDeleted;
      result.accessTokensDeleted = accessTokensDeleted;
      result.refreshTokensDeleted = refreshTokensDeleted;
      result.passwordResetRequestsDeleted = passwordResetRequestsDeleted;
      result.revokedAuthJtisDeleted = revokedAuthJtisDeleted;
      result.tokenBlacklistDeleted = tokenBlacklistDeleted;

      const duration = Date.now() - startTime;
      console.log(`[CleanupService] Cleanup completed in ${duration}ms:`, result);

      return result;
    } catch (error) {
      console.error('[CleanupService] Cleanup failed:', error);
      result.error = error instanceof Error ? error.message : String(error);
      return result;
    }
  }

  /**
   * 启动定时清理任务
   * @param intervalMinutes 清理间隔（分钟）
   */
  static startScheduledCleanup(intervalMinutes: number = 60): NodeJS.Timeout {
    console.log(`[CleanupService] Starting scheduled cleanup every ${intervalMinutes} minutes`);
    
    // 立即执行一次
    this.performCleanup();
    
    // 设置定时任务
    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      this.performCleanup();
    }, intervalMs);
    
    return timer;
  }

  /**
   * 停止定时清理任务
   */
  static stopScheduledCleanup(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    console.log('[CleanupService] Scheduled cleanup stopped');
  }
}