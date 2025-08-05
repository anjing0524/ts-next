/**
 * SimplifiedTokenStorage - 简化的令牌存储策略
 * 
 * 专注于核心功能，提高可维护性
 */

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export class SimplifiedTokenStorage {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly TOKEN_EXPIRY_KEY = 'token_expiry';

  /**
   * 存储令牌
   */
  static setTokens(accessToken: string, refreshToken?: string, expiresIn: number = 3600): void {
    if (typeof window === 'undefined') return;

    const expiresAt = Date.now() + (expiresIn * 1000);

    // 使用HttpOnly Cookie存储访问令牌（更安全）
    this.setCookie(this.ACCESS_TOKEN_KEY, accessToken, {
      secure: window.location.protocol === 'https:',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: expiresIn,
    });

    // 使用sessionStorage存储刷新令牌（便于访问）
    if (refreshToken) {
      sessionStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }

    // 存储过期时间
    sessionStorage.setItem(this.TOKEN_EXPIRY_KEY, expiresAt.toString());
  }

  /**
   * 获取访问令牌
   */
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    // 优先从Cookie获取
    const cookieToken = this.getCookie(this.ACCESS_TOKEN_KEY);
    if (cookieToken) return cookieToken;

    // 降级到sessionStorage
    return sessionStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  /**
   * 获取刷新令牌
   */
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * 检查令牌是否过期
   */
  static isTokenExpired(): boolean {
    if (typeof window === 'undefined') return true;
    
    const expiryTime = sessionStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return true;

    return Date.now() >= parseInt(expiryTime, 10);
  }

  /**
   * 获取令牌剩余时间（秒）
   */
  static getTokenRemainingTime(): number {
    if (typeof window === 'undefined') return 0;
    
    const expiryTime = sessionStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return 0;

    const remaining = parseInt(expiryTime, 10) - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * 清除所有令牌
   */
  static clearTokens(): void {
    if (typeof window === 'undefined') return;

    // 清除Cookie
    this.clearCookie(this.ACCESS_TOKEN_KEY);

    // 清除sessionStorage
    sessionStorage.removeItem(this.ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_EXPIRY_KEY);
  }

  /**
   * 设置Cookie
   */
  private static setCookie(name: string, value: string, options: {
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number;
  }): void {
    const cookieParts = [`${name}=${encodeURIComponent(value)}`];
    
    if (options.secure) cookieParts.push('Secure');
    if (options.httpOnly) cookieParts.push('HttpOnly');
    if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
    if (options.maxAge) cookieParts.push(`Max-Age=${options.maxAge}`);
    cookieParts.push('Path=/');

    document.cookie = cookieParts.join('; ');
  }

  /**
   * 获取Cookie值
   */
  private static getCookie(name: string): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [cookieName, cookieValue] = cookie.trim().split('=');
      if (cookieName === name) {
        return decodeURIComponent(cookieValue);
      }
    }
    return null;
  }

  /**
   * 清除Cookie
   */
  private static clearCookie(name: string): void {
    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  /**
   * 验证当前会话是否有效
   */
  static isValidSession(): boolean {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();
    
    // 至少需要有一个令牌
    if (!accessToken && !refreshToken) return false;

    // 检查是否过期
    return !this.isTokenExpired();
  }

  /**
   * 获取令牌信息（用于调试）
   */
  static getTokenInfo(): {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isExpired: boolean;
    remainingTime: number;
  } {
    return {
      hasAccessToken: !!this.getAccessToken(),
      hasRefreshToken: !!this.getRefreshToken(),
      isExpired: this.isTokenExpired(),
      remainingTime: this.getTokenRemainingTime(),
    };
  }
}