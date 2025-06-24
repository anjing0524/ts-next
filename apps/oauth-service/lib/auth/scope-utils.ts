import { OAuthClient as Client } from '@prisma/client';

/**
 * Scope (权限范围) 工具类
 * Scope utility class
 * 
 * Scope 用于定义客户端可以请求访问哪些受保护资源的权限
 * Scope is used to define permissions a client can request to access protected resources
 */
export class ScopeUtils {
  /**
   * 将以空格分隔的 scope 字符串解析为字符串数组
   * Parses a space-separated scope string into an array of strings
   * 
   * @param scopeString - 包含一个或多个 scope 的字符串 (String containing one or more scopes)
   * @returns 返回一个包含各个 scope 的字符串数组 (Returns an array of strings, each being a scope)
   */
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return [];
    return scopeString.split(' ').filter((s) => s.length > 0);
  }

  /**
   * 将 scope 字符串数组格式化为以空格分隔的单个字符串
   * Formats an array of scope strings into a single space-separated string
   * 
   * @param scopes - 包含一个或多个 scope 的字符串数组 (Array of strings containing one or more scopes)
   * @returns 返回格式化后的 scope 字符串 (Returns the formatted scope string)
   */
  static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  /**
   * 验证请求的 scopes 是否有效 (重载方法 - 异步版本)
   * Validates if the requested scopes are valid (overloaded method - async version)
   */
  static async validateScopes(
    scopes: string[],
    client: Client
  ): Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>;

  /**
   * 验证请求的 scopes 是否有效 (重载方法 - 同步版本)
   * Validates if the requested scopes are valid (overloaded method - sync version)
   */
  static validateScopes(
    requestedScopes: string[],
    allowedScopes: string[]
  ): { valid: boolean; invalidScopes: string[]; error_description?: string };

  /**
   * 验证请求的 scopes 是否有效
   * Validates if the requested scopes are valid
   */
  static validateScopes(
    scopes: string[],
    clientOrAllowedScopes: Client | string[]
  ):
    | Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>
    | { valid: boolean; invalidScopes: string[]; error_description?: string } {
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    if (Array.isArray(clientOrAllowedScopes)) {
      const invalidScopes = scopes.filter((scope) => !clientOrAllowedScopes.includes(scope));
      return {
        valid: invalidScopes.length === 0,
        invalidScopes,
        error_description: invalidScopes.length > 0 ? `Requested scope(s) not in allowed list: ${invalidScopes.join(', ')}` : undefined,
      };
    }

    const client = clientOrAllowedScopes as Client;

    return (async () => {
      let clientAllowedScopes: string[] = [];
      if (client.allowedScopes) {
        try {
          clientAllowedScopes = JSON.parse(client.allowedScopes as string);
          if (!Array.isArray(clientAllowedScopes)) clientAllowedScopes = [];
        } catch (e) {
          console.error('Failed to parse client.allowedScopes for client ID:', client.id, e);
          clientAllowedScopes = [];
        }
      }

      const invalidAgainstClientAllowed = scopes.filter(
        (scope) => !clientAllowedScopes.includes(scope)
      );
      if (invalidAgainstClientAllowed.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidAgainstClientAllowed,
          error_description: `Requested scope(s) not allowed for this client: ${invalidAgainstClientAllowed.join(', ')}`,
        };
      }

      return { valid: true, invalidScopes: [] };
    })();
  }

  /**
   * 检查用户是否拥有指定的 scope
   * Checks if the user has the specified scope
   * 
   * @param userScopes - 用户拥有的 scope 数组 (Array of scopes the user has)
   * @param requiredScope - 需要检查的 scope (The scope to check for)
   * @returns 如果用户拥有该 scope 则返回 true (Returns true if the user has the scope)
   */
  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  /**
   * 检查用户是否拥有任意一个指定的 scope
   * Checks if the user has any of the specified scopes
   * 
   * @param userScopes - 用户拥有的 scope 数组 (Array of scopes the user has)
   * @param requiredScopes - 需要检查的 scope 数组 (Array of scopes to check for)
   * @returns 如果用户拥有任意一个 scope 则返回 true (Returns true if the user has any of the scopes)
   */
  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => userScopes.includes(scope));
  }

  /**
   * 检查用户是否拥有所有指定的 scope
   * Checks if the user has all the specified scopes
   * 
   * @param userScopes - 用户拥有的 scope 数组 (Array of scopes the user has)
   * @param requiredScopes - 需要检查的 scope 数组 (Array of scopes to check for)
   * @returns 如果用户拥有所有 scope 则返回 true (Returns true if the user has all the scopes)
   */
  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
} 