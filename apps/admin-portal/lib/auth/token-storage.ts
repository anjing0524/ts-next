// apps/admin-portal/src/lib/auth/token-storage.ts

/**
 * TokenStorage 类用于管理认证令牌（Access Token 和 Refresh Token）。
 * 提供了设置、获取和清除令牌的方法。
 * Access Token 存储在 Cookie 中，Refresh Token 存储在 sessionStorage 中。
 * 这种分离有助于提高安全性，HttpOnly Cookie 可以防止 XSS 攻击获取 Access Token，
 * sessionStorage 用于 Refresh Token，生命周期与会话绑定。
 */
export class TokenStorage {
  private static readonly ACCESS_TOKEN_KEY = 'auth_token'; // Access Token 的 Cookie 名称
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token'; // Refresh Token 在 sessionStorage 中的键名

  /**
   * 设置 Access Token 和可选的 Refresh Token。
   * @param accessToken - 要存储的 Access Token。
   * @param refreshToken - (可选) 要存储的 Refresh Token。
   */
  static setTokens(accessToken: string, refreshToken?: string): void {
    // 存储 Access Token 到 Cookie
    // 在生产环境中，建议将 Secure 属性设置为 true，HttpOnly 也应考虑设置
    // SameSite=Lax 有助于防止 CSRF 攻击
    document.cookie = `${this.ACCESS_TOKEN_KEY}=${accessToken}; path=/; SameSite=Lax;`;

    // 如果提供了 Refresh Token，则将其存储到 sessionStorage
    if (refreshToken) {
      sessionStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  /**
   * 获取存储在 Cookie 中的 Access Token。
   * @returns Access Token 字符串，如果未找到则返回 null。
   */
  static getAccessToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === this.ACCESS_TOKEN_KEY) {
        return value;
      }
    }
    return null;
  }

  /**
   * 获取存储在 sessionStorage 中的 Refresh Token。
   * @returns Refresh Token 字符串，如果未找到则返回 null。
   */
  static getRefreshToken(): string | null {
    return sessionStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * 清除所有存储的认证令牌。
   * 将 Access Token Cookie 设置为过期，并从 sessionStorage 中移除 Refresh Token。
   */
  static clearTokens(): void {
    // 清除 Access Token Cookie
    document.cookie = `${this.ACCESS_TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax;`;
    // 从 sessionStorage 中移除 Refresh Token
    sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
}
