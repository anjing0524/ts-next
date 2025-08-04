/**
 * EnhancedTokenStorage - 安全令牌存储策略
 * 
 * 使用HttpOnly Cookie存储刷新令牌，提供CSRF保护
 * 支持服务器端和客户端的无缝集成
 */

interface TokenStorageOptions {
  accessToken: string;
  refreshToken?: string;
  csrfToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
}

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  maxAge: number;
  path: string;
  domain?: string;
}

export class EnhancedTokenStorage {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly CSRF_TOKEN_KEY = 'csrf_token';
  private static readonly TOKEN_EXPIRES_AT_KEY = 'token_expires_at';

  /**
   * 获取Cookie配置
   */
  private static getCookieConfig(type: 'access' | 'refresh' | 'csrf'): CookieOptions {
    const isProduction = process.env.NODE_ENV === 'production';
    const isClient = typeof window !== 'undefined';

    const baseConfig = {
      secure: isProduction,
      path: '/',
      domain: isClient ? window.location.hostname : undefined,
    };

    switch (type) {
      case 'refresh':
        return {
          ...baseConfig,
          httpOnly: true,
          sameSite: 'Strict',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        };
      case 'access':
        return {
          ...baseConfig,
          httpOnly: true,
          sameSite: 'Lax',
          maxAge: 3600, // 1 hour
        };
      case 'csrf':
        return {
          ...baseConfig,
          httpOnly: false, // CSRF token needs to be accessible by JavaScript
          sameSite: 'Lax',
          maxAge: 3600, // 1 hour
        };
    }
  }

  /**
   * 设置令牌（支持服务器端和客户端）
   */
  static setTokens(options: TokenStorageOptions): void {
    const { accessToken, refreshToken, csrfToken, expiresIn = 3600, refreshTokenExpiresIn = 30 * 24 * 60 * 60 } = options;

    // 客户端环境 - 使用document.cookie
    if (typeof window !== 'undefined') {
      this.setClientTokens({ accessToken, refreshToken, csrfToken, expiresIn, refreshTokenExpiresIn });
    }

    // 设置过期时间（客户端存储）
    if (typeof window !== 'undefined' && typeof Storage !== 'undefined') {
      const expiresAt = Date.now() + (expiresIn * 1000);
      sessionStorage.setItem(this.TOKEN_EXPIRES_AT_KEY, expiresAt.toString());
    }
  }

  /**
   * 客户端令牌设置
   */
  private static setClientTokens(options: TokenStorageOptions): void {
    const { accessToken, refreshToken, csrfToken, expiresIn = 3600, refreshTokenExpiresIn = 30 * 24 * 60 * 60 } = options;

    // 设置访问令牌Cookie
    const accessConfig = this.getCookieConfig('access');
    this.setCookie(this.ACCESS_TOKEN_KEY, accessToken, accessConfig);

    // 设置刷新令牌Cookie（HttpOnly）
    if (refreshToken) {
      const refreshConfig = this.getCookieConfig('refresh');
      this.setCookie(this.REFRESH_TOKEN_KEY, refreshToken, {
        ...refreshConfig,
        maxAge: refreshTokenExpiresIn,
      });
    }

    // 设置CSRF令牌Cookie
    if (csrfToken) {
      const csrfConfig = this.getCookieConfig('csrf');
      this.setCookie(this.CSRF_TOKEN_KEY, csrfToken, csrfConfig);
    }
  }

  /**
   * 设置Cookie（客户端）
   */
  private static setCookie(name: string, value: string, options: CookieOptions): void {
    const cookieParts: string[] = [`${name}=${value}`];
    
    if (options.path) cookieParts.push(`path=${options.path}`);
    if (options.domain) cookieParts.push(`domain=${options.domain}`);
    if (options.maxAge) cookieParts.push(`max-age=${options.maxAge}`);
    if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
    if (options.httpOnly) cookieParts.push('HttpOnly');
    if (options.secure) cookieParts.push('Secure');

    document.cookie = cookieParts.join('; ');
  }

  /**
   * 获取访问令牌
   */
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return this.getCookieValue(this.ACCESS_TOKEN_KEY);
  }

  /**
   * 获取刷新令牌
   */
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return this.getCookieValue(this.REFRESH_TOKEN_KEY);
  }

  /**
   * 获取CSRF令牌
   */
  static getCSRFToken(): string | null {
    if (typeof window === 'undefined') return null;
    return this.getCookieValue(this.CSRF_TOKEN_KEY);
  }

  /**
   * 从Cookie获取值
   */
  private static getCookieValue(name: string): string | null {
    if (typeof document === 'undefined') return null;
    
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const parts = cookie.trim().split('=');
      const cookieName = parts[0];
      const cookieValue = parts[1];
      if (cookieName === name && cookieValue !== undefined) {
        return decodeURIComponent(cookieValue);
      }
    }
    return null;
  }

  /**
   * 清除所有令牌
   */
  static clearTokens(): void {
    if (typeof window === 'undefined') return;

    // 清除Cookie
    this.clearCookie(this.ACCESS_TOKEN_KEY);
    this.clearCookie(this.REFRESH_TOKEN_KEY);
    this.clearCookie(this.CSRF_TOKEN_KEY);

    // 清除sessionStorage
    if (typeof Storage !== 'undefined') {
      sessionStorage.removeItem(this.TOKEN_EXPIRES_AT_KEY);
      sessionStorage.removeItem('refresh_token'); // 向后兼容
    }
  }

  /**
   * 清除Cookie
   */
  private static clearCookie(name: string): void {
    if (typeof document === 'undefined') return;
    
    const config = this.getCookieConfig('access');
    const cookieParts = [
      `${name}=`,
      `path=${config.path}`,
      'expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ];
    
    if (config.sameSite) cookieParts.push(`SameSite=${config.sameSite}`);
    if (config.secure) cookieParts.push('Secure');
    if (config.httpOnly) cookieParts.push('HttpOnly');

    document.cookie = cookieParts.join('; ');
  }

  /**
   * 生成CSRF令牌
   */
  static generateCSRFToken(): string {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // 降级到Math.random（不推荐生产使用）
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, '');
  }

  /**
   * 验证CSRF令牌
   */
  static validateCSRFToken(token: string): boolean {
    const storedToken = this.getCSRFToken();
    if (!storedToken || !token) return false;
    
    // 使用恒定时间比较防止时序攻击
    return this.secureCompare(storedToken, token);
  }

  /**
   * 恒定时间字符串比较（防止时序攻击）
   */
  private static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * 设置令牌过期时间
   */
  static setTokenExpiresAt(expiresAt: number): void {
    if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
    sessionStorage.setItem(this.TOKEN_EXPIRES_AT_KEY, expiresAt.toString());
  }

  /**
   * 获取令牌过期时间
   */
  static getTokenExpiresAt(): number | null {
    if (typeof window === 'undefined' || typeof Storage === 'undefined') return null;
    const expiresAt = sessionStorage.getItem(this.TOKEN_EXPIRES_AT_KEY);
    return expiresAt ? parseInt(expiresAt, 10) : null;
  }

  /**
   * 检查令牌是否过期
   */
  static isTokenExpired(): boolean {
    const expiresAt = this.getTokenExpiresAt();
    if (!expiresAt) return true;
    
    return Date.now() >= expiresAt;
  }

  /**
   * 获取令牌剩余有效期（秒）
   */
  static getTokenRemainingTime(): number {
    const expiresAt = this.getTokenExpiresAt();
    if (!expiresAt) return 0;
    
    const remaining = expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }

  /**
   * 检查是否支持Cookie存储
   */
  static isCookieStorageAvailable(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  /**
   * 获取所有令牌（调试用，不要在生产环境使用）
   */
  static getAllTokens(): { accessToken: string | null; refreshToken: string | null; csrfToken: string | null } {
    return {
      accessToken: this.getAccessToken(),
      refreshToken: this.getRefreshToken(),
      csrfToken: this.getCSRFToken(),
    };
  }

  /**
   * 向后兼容：设置令牌（旧格式）
   */
  static setTokensLegacy(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    this.setTokens({
      accessToken,
      refreshToken,
      expiresIn,
      csrfToken: this.generateCSRFToken()
    });
  }
}