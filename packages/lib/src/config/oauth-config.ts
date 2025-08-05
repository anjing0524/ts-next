/**
 * OAuth2配置管理类
 * 统一管理OAuth相关配置，支持环境变量覆盖
 * @author 架构团队
 * @since 2.0.0
 */

/**
 * OAuth客户端配置接口
 */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

/**
 * OAuth服务端配置接口
 */
export interface OAuthServiceConfig {
  serviceUrl: string;
  issuer: string;
  jwksUri: string;
}

/**
 * OAuth2配置管理类
 * 提供统一的配置获取接口，支持环境变量和默认值
 */
export class OAuthConfig {
  /**
   * 获取OAuth服务URL
   * @returns OAuth服务的基础URL
   */
  static getServiceUrl(): string {
    return process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
  }

  /**
   * 获取OAuth客户端配置
   * @returns 客户端配置对象
   */
  static getClientConfig(): OAuthClientConfig {
    // 客户端重定向URI需要动态获取，支持不同环境
    const getRedirectUri = (): string => {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}/auth/callback`;
      }
      return process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback';
    };

    return {
      clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || 'authcenteradminclientsecret',
      redirectUri: getRedirectUri(),
    };
  }

  /**
   * 获取OAuth服务端配置
   * @returns 服务端配置对象
   */
  static getServiceConfig(): OAuthServiceConfig {
    const serviceUrl = this.getServiceUrl();

    return {
      serviceUrl,
      issuer: process.env.JWT_ISSUER || serviceUrl,
      jwksUri: `${serviceUrl}/.well-known/jwks.json`,
    };
  }

  /**
   * 获取完整的授权端点URL
   * @returns 授权端点URL
   */
  static getAuthorizeUrl(): string {
    return `${this.getServiceUrl()}/api/v2/oauth/authorize`;
  }

  /**
   * 获取完整的令牌端点URL
   * @returns 令牌端点URL
   */
  static getTokenUrl(): string {
    return `${this.getServiceUrl()}/api/v2/oauth/token`;
  }

  /**
   * 获取完整的用户信息端点URL
   * @returns 用户信息端点URL
   */
  static getUserInfoUrl(): string {
    return `${this.getServiceUrl()}/api/v2/oauth/userinfo`;
  }

  /**
   * 获取完整的令牌撤销端点URL
   * @returns 令牌撤销端点URL
   */
  static getRevokeUrl(): string {
    return `${this.getServiceUrl()}/api/v2/oauth/revoke`;
  }

  /**
   * 检查配置是否为开发环境
   * @returns 是否为开发环境
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * 检查配置是否为生产环境
   * @returns 是否为生产环境
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}

/**
 * 默认配置常量
 */
export const DEFAULT_OAUTH_CONFIG = {
  SERVICE_URL: 'http://localhost:3001',
  CLIENT_ID: 'auth-center-admin-client',
  CLIENT_SECRET: 'authcenteradminclientsecret',
  REDIRECT_URI: 'http://localhost:3002/auth/callback',
  SCOPES: ['openid', 'profile', 'admin:full_access'],
} as const;
