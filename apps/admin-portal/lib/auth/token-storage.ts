// apps/admin-portal/src/lib/auth/token-storage.ts

/**
 * TokenStorage 类用于管理认证令牌（Access Token 和 Refresh Token）。
 * 提供了设置、获取和清除令牌的方法。
 * Access Token 存储在 Cookie 中，Refresh Token 存储在 sessionStorage 中。
 * 这种分离有助于提高安全性，HttpOnly Cookie 可以防止 XSS 攻击获取 Access Token，
 * sessionStorage 用于 Refresh Token，生命周期与会话绑定。
 */
export class TokenStorage {
  private static readonly ACCESS_TOKEN_KEY = 'access_token'; // Access Token 的 Cookie 名称
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token'; // Refresh Token 在 sessionStorage 中的键名

  /**
   * 获取Cookie的安全配置
   */
  private static getCookieConfig(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    maxAge: number;
    path: string;
  } {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      httpOnly: true, // 防止XSS攻击
      secure: isProduction, // 生产环境强制HTTPS
      sameSite: 'Lax', // CSRF防护
      maxAge: 3600, // 1小时
      path: '/',
    };
  }

  /**
   * 设置 Access Token 和可选的 Refresh Token。
   * @param accessToken - 要存储的 Access Token。
   * @param refreshToken - (可选) 要存储的 Refresh Token。
   */
  static setTokens(accessToken: string, refreshToken?: string): void {
    if (typeof window === 'undefined') return; // 服务器端跳过

    const config = this.getCookieConfig();
    
    // 构建Cookie字符串
    const cookieParts = [
      `${this.ACCESS_TOKEN_KEY}=${accessToken}`,
      `path=${config.path}`,
      `SameSite=${config.sameSite}`,
      `Max-Age=${config.maxAge}`,
    ];
    
    if (config.httpOnly) {
      cookieParts.push('HttpOnly');
    }
    
    if (config.secure) {
      cookieParts.push('Secure');
    }

    document.cookie = cookieParts.join('; ');

    // 如果提供了 Refresh Token，则将其存储到 sessionStorage
    if (refreshToken && typeof Storage !== 'undefined') {
      sessionStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  /**
   * 获取存储在 Cookie 中的 Access Token。
   * @returns Access Token 字符串，如果未找到则返回 null。
   */
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null; // 服务器端返回null

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === this.ACCESS_TOKEN_KEY) {
        return value ?? null;
      }
    }
    return null;
  }

  /**
   * 获取存储在 sessionStorage 中的 Refresh Token。
   * @returns Refresh Token 字符串，如果未找到则返回 null。
   */
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined' || typeof Storage === 'undefined') return null; // 服务器端返回null
    return sessionStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * 清除所有存储的认证令牌。
   * 将 Access Token Cookie 设置为过期，并从 sessionStorage 中移除 Refresh Token。
   */
  static clearTokens(): void {
    if (typeof window === 'undefined') return; // 服务器端跳过

    const config = this.getCookieConfig();
    
    // 构建清除Cookie的字符串
    const cookieParts = [
      `${this.ACCESS_TOKEN_KEY}=`,
      `path=${config.path}`,
      'expires=Thu, 01 Jan 1970 00:00:00 GMT',
      `SameSite=${config.sameSite}`,
    ];
    
    if (config.httpOnly) {
      cookieParts.push('HttpOnly');
    }
    
    if (config.secure) {
      cookieParts.push('Secure');
    }

    document.cookie = cookieParts.join('; ');
    
    // 从 sessionStorage 中移除 Refresh Token
    if (typeof Storage !== 'undefined') {
      sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
    }
  }
}
