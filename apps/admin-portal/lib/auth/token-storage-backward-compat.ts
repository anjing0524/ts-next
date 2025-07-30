/**
 * TokenStorageBackwardCompat - 向后兼容层
 * 
 * 提供对旧TokenStorage API的向后兼容支持，同时内部使用EnhancedTokenStorage
 */

import { EnhancedTokenStorage } from './enhanced-token-storage';
import { TokenStorage as LegacyTokenStorage } from './token-storage';

/**
 * 向后兼容的TokenStorage类
 * 保持与旧TokenStorage相同的API签名，但内部使用新的安全实现
 */
export class TokenStorageBackwardCompat {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly TOKEN_EXPIRES_AT_KEY = 'token_expires_at';

  /**
   * 保持与旧API兼容的设置令牌方法
   */
  static setTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    // 使用新的EnhancedTokenStorage，但保持旧API
    EnhancedTokenStorage.setTokens({
      accessToken,
      refreshToken,
      expiresIn,
      csrfToken: EnhancedTokenStorage.generateCSRFToken(),
    });
  }

  /**
   * 保持与旧API兼容的获取访问令牌方法
   */
  static getAccessToken(): string | null {
    return EnhancedTokenStorage.getAccessToken();
  }

  /**
   * 保持与旧API兼容的获取刷新令牌方法
   */
  static getRefreshToken(): string | null {
    return EnhancedTokenStorage.getRefreshToken();
  }

  /**
   * 保持与旧API兼容的设置令牌过期时间方法
   */
  static setTokenExpiresAt(expiresAt: number): void {
    EnhancedTokenStorage.setTokenExpiresAt(expiresAt);
  }

  /**
   * 保持与旧API兼容的获取令牌过期时间方法
   */
  static getTokenExpiresAt(): number | null {
    return EnhancedTokenStorage.getTokenExpiresAt();
  }

  /**
   * 保持与旧API兼容的清除令牌方法
   */
  static clearTokens(): void {
    EnhancedTokenStorage.clearTokens();
  }

  /**
   * 保持与旧API兼容的检查令牌是否过期方法
   */
  static isTokenExpired(): boolean {
    return EnhancedTokenStorage.isTokenExpired();
  }

  /**
   * 保持与旧API兼容的获取令牌剩余时间方法
   */
  static getTokenRemainingTime(): number {
    return EnhancedTokenStorage.getTokenRemainingTime();
  }

  /**
   * 迁移工具：从旧存储迁移到新存储
   */
  static async migrateFromLegacy(): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    message?: string;
  }> {
    try {
      // 检查是否有旧格式的数据
      const legacyAccessToken = LegacyTokenStorage.getAccessToken();
      const legacyRefreshToken = LegacyTokenStorage.getRefreshToken();
      const legacyExpiresAt = LegacyTokenStorage.getTokenExpiresAt();

      if (legacyAccessToken) {
        // 迁移到新的安全存储
        const expiresIn = legacyExpiresAt 
          ? Math.max(0, Math.floor((legacyExpiresAt - Date.now()) / 1000))
          : 3600;

        EnhancedTokenStorage.setTokens({
          accessToken: legacyAccessToken,
          refreshToken: legacyRefreshToken || undefined,
          expiresIn,
          csrfToken: EnhancedTokenStorage.generateCSRFToken(),
        });

        // 清除旧存储
        LegacyTokenStorage.clearTokens();

        return {
          success: true,
          accessToken: legacyAccessToken,
          refreshToken: legacyRefreshToken || undefined,
          message: 'Successfully migrated from legacy storage',
        };
      }

      return {
        success: false,
        message: 'No legacy data found',
      };
    } catch (error) {
      console.error('Migration error:', error);
      return {
        success: false,
        message: 'Migration failed',
      };
    }
  }

  /**
   * 兼容性检查：检查是否需要迁移
   */
  static checkMigrationNeeded(): boolean {
    try {
      // 检查是否有旧格式的数据
      const legacyAccessToken = LegacyTokenStorage.getAccessToken();
      const legacyRefreshToken = sessionStorage.getItem('refresh_token');

      // 检查是否有新格式的数据
      const newAccessToken = EnhancedTokenStorage.getAccessToken();
      const newRefreshToken = EnhancedTokenStorage.getRefreshToken();

      // 如果有旧数据但没有新数据，则需要迁移
      return (!!legacyAccessToken || !!legacyRefreshToken) && (!newAccessToken && !newRefreshToken);
    } catch {
      return false;
    }
  }

  /**
   * 获取存储状态信息（用于调试）
   */
  static getStorageStatus(): {
    hasLegacyData: boolean;
    hasNewData: boolean;
    needsMigration: boolean;
    legacyTokens: {
      accessToken: string | null;
      refreshToken: string | null;
    };
    newTokens: {
      accessToken: string | null;
      refreshToken: string | null;
      csrfToken: string | null;
    };
  } {
    const legacyAccessToken = LegacyTokenStorage.getAccessToken();
    const legacyRefreshToken = sessionStorage.getItem('refresh_token');
    const newTokens = EnhancedTokenStorage.getAllTokens();

    const needsMigration = this.checkMigrationNeeded();

    return {
      hasLegacyData: !!legacyAccessToken || !!legacyRefreshToken,
      hasNewData: !!newTokens.accessToken || !!newTokens.refreshToken || !!newTokens.csrfToken,
      needsMigration,
      legacyTokens: {
        accessToken: legacyAccessToken,
        refreshToken: legacyRefreshToken,
      },
      newTokens,
    };
  }
}

/**
 * 自动迁移工具
 * 在应用启动时自动检查并执行迁移
 */
export class AutoMigration {
  private static migrationAttempted = false;

  /**
   * 执行自动迁移
   */
  static async performAutoMigration(): Promise<void> {
    if (this.migrationAttempted) return;
    this.migrationAttempted = true;

    try {
      if (TokenStorageBackwardCompat.checkMigrationNeeded()) {
        console.log('Legacy token storage detected, performing migration...');
        const result = await TokenStorageBackwardCompat.migrateFromLegacy();
        
        if (result.success) {
          console.log('Token storage migration completed successfully');
        } else {
          console.warn('Token storage migration failed:', result.message);
        }
      }
    } catch (error) {
      console.error('Auto migration error:', error);
    }
  }

  /**
   * 重置迁移状态（用于测试）
   */
  static resetMigrationState(): void {
    this.migrationAttempted = false;
  }
}

// 自动执行迁移（如果环境支持）
if (typeof window !== 'undefined') {
  AutoMigration.performAutoMigration();
}

/**
 * 兼容性导出，保持与旧TokenStorage相同的API
 */
export const TokenStorage = TokenStorageBackwardCompat;