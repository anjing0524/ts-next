// 导入 Node.js 内置的 crypto 模块，用于加密操作，如生成哈希、随机字节等。
import crypto from 'crypto';

// 导入 Next.js 服务器相关的类型，例如 NextRequest 用于处理HTTP请求。
import { NextRequest } from 'next/server';

// 导入 Prisma 客户端生成的类型，用于与数据库交互。
// OAuthClient 被重命名为 Client 以避免与全局 Client 类型冲突。
import { User, OAuthClient as Client } from '@prisma/client';
// 导入 date-fns 库中的函数，用于日期和时间的操作，例如计算令牌的过期时间。
import { addHours, addDays } from 'date-fns';
// 导入 jose 库，用于处理 JWT (JSON Web Tokens) 的签名、验证和编解码。
import * as jose from 'jose';

// 导入共享的 Prisma 客户端实例。
import { prisma } from '@/lib/prisma';
// 导入权限服务，用于获取用户权限等。
import { PermissionService } from '@/lib/services/permissionService';

// 实例化权限服务，以便在工具类中使用。
const permissionService = new PermissionService();

// 定义 OAuth 2.0 错误响应的接口结构。
// 遵循 RFC 6749 (OAuth 2.0 规范) Section 5.2 关于错误响应的定义。
export interface OAuth2Error {
  error: string; // 错误代码 (必需)。
  error_description?: string; // 错误的详细描述 (可选)。
  error_uri?: string; // 指向包含错误更多信息页面的URI (可选)。
  state?: string; // 如果客户端请求中包含了 state 参数，则错误响应中也应包含 (可选)。
}

// 定义 OAuth 2.0 标准错误代码常量。
// 这些常量用于在发生错误时，向客户端返回标准化的错误信息。
export const OAuth2ErrorTypes = {
  INVALID_REQUEST: 'invalid_request', // 请求格式无效、缺少必需参数、包含无效参数值等。
  INVALID_CLIENT: 'invalid_client',   // 客户端认证失败 (例如，未知客户端、未包含客户端认证、认证方式不支持)。
  INVALID_GRANT: 'invalid_grant',     // 提供的授权凭证 (如授权码、刷新令牌、资源所有者凭据) 无效、过期或已被撤销。
  UNAUTHORIZED_CLIENT: 'unauthorized_client', // 认证的客户端无权使用此授权类型。
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type', // 授权服务器不支持请求的授权类型。
  INVALID_SCOPE: 'invalid_scope',     // 请求的 scope 无效、未知、格式不正确或超出了资源所有者授予的范围。
  ACCESS_DENIED: 'access_denied',     // 资源所有者或授权服务器拒绝了请求。
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type', // 授权服务器不支持使用此 response_type 获取授权码或访问令牌。
  SERVER_ERROR: 'server_error',       // 授权服务器遇到意外情况，无法完成请求。
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable', // 服务器当前无法处理请求，通常由于过载或维护。
} as const; // 'as const' 将对象的属性变为只读，并将其类型推断为字面量类型。

/**
 * PKCE (Proof Key for Code Exchange) 工具类。
 * PKCE (RFC 7636) 是一种用于增强 OAuth 2.0 公共客户端 (如移动应用和单页应用) 安全性的机制，
 * 主要用于防止授权码拦截攻击。
 * 流程:
 * 1. 客户端生成一个随机的 code_verifier。
 * 2. 客户端使用指定的转换方法 (通常是 S256，即 SHA256 后 Base64URL编码) 从 code_verifier 生成 code_challenge。
 * 3. 客户端在向授权服务器发起授权请求时，带上 code_challenge 和 code_challenge_method。
 * 4. 授权服务器存储 code_challenge 和 code_challenge_method。
 * 5. 客户端在向令牌端点请求访问令牌时，带上原始的 code_verifier。
 * 6. 令牌端点使用与步骤2相同的方法从接收到的 code_verifier 计算挑战值，并与之前存储的 code_challenge 比较。
 *    如果匹配，则认证成功；否则失败。
 */
export class PKCEUtils {
  /**
   * 生成一个符合 RFC 7636 规范的随机 code_verifier。
   * @returns 返回一个 Base64URL 编码的随机字符串，长度通常为43-128个字符。
   */
  static generateCodeVerifier(): string {
    // 生成32字节的随机数据，然后进行 Base64URL 编码。
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 根据给定的 code_verifier 和指定的转换方法 (默认为 S256) 生成 code_challenge。
   * @param verifier - 客户端生成的 code_verifier。
   * @returns 返回计算得到的 code_challenge (Base64URL 编码)。
   */
  static generateCodeChallenge(verifier: string): string {
    // S256 方法: SHA256 哈希后进行 Base64URL 编码。
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配。
   * @param verifier - 客户端在令牌请求中提供的 code_verifier。
   * @param challenge - 授权服务器在授权请求阶段存储的 code_challenge。
   * @param method - 生成 code_challenge 时使用的方法，默认为 'S256'。目前通常只支持 'S256'。
   * @returns 如果验证成功则返回 true，否则返回 false。
   * @security 安全考虑: 此方法用于令牌端点，验证客户端是否是最初发起授权请求的那个客户端，防止授权码被恶意应用截获后使用。
   */
  static verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: string = 'S256' // 默认且推荐使用 S256
  ): boolean {
    // 如果方法不是 S256，则认为验证失败 (或者可以抛出错误，表示不支持的方法)。
    if (method !== 'S256') {
      console.warn(`PKCEUtils: Unsupported code_challenge_method: ${method}`);
      return false;
    }
    // 根据 verifier 计算期望的 challenge 值。
    const calculatedChallenge = this.generateCodeChallenge(verifier);
    // 比较计算得到的 challenge 与存储的 challenge 是否一致。
    // 安全考虑: 应使用固定时间比较函数 (timing-safe comparison) 来防止时序攻击，尽管对于哈希值的比较，风险相对较低。
    // Node.js crypto.timingSafeEqual 可用于此目的，但它要求 Buffer 类型且长度相同。
    // 此处直接比较字符串，在多数情况下是可接受的。
    return calculatedChallenge === challenge;
  }

  /**
   * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范。
   * 规范要求 code_challenge 长度在43到128个字符之间，且字符集为 A-Z, a-z, 0-9, '-', '.', '_', '~'。
   * @param challenge - 要验证的 code_challenge 字符串。
   * @returns 如果格式有效则返回 true，否则返回 false。
   */
  static validateCodeChallenge(challenge: string): boolean {
    // RFC 7636 (Section 4.2): code_challenge 必须是43-128个字符。
    // 字符集为: A-Z / a-z / 0-9 / "-" / "." / "_" / "~" (unreserved characters by RFC 3986)
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
  }

  /**
   * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范。
   * 规范要求 code_verifier 长度在43到128个字符之间，且字符集同 code_challenge。
   * @param verifier - 要验证的 code_verifier 字符串。
   * @returns 如果格式有效则返回 true，否则返回 false。
   */
  static validateCodeVerifier(verifier: string): boolean {
    // RFC 7636 (Section 4.1): code_verifier 必须是43-128个字符。
    // 字符集同 code_challenge。
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
  }
}

/**
 * Scope (权限范围) 工具类。
 * Scope 用于定义客户端可以请求访问哪些受保护资源的权限。
 * OAuth 2.0 中的 scope 通常是以空格分隔的字符串。
 */
export class ScopeUtils {
  /**
   * 将以空格分隔的 scope 字符串解析为字符串数组。
   * @param scopeString - 包含一个或多个 scope 的字符串，例如 "openid profile email"。
   * @returns 返回一个包含各个 scope 的字符串数组。如果输入为空或未定义，则返回空数组。
   */
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return []; // 如果 scopeString 为空或 undefined，返回空数组
    // 使用空格分割字符串，并过滤掉可能产生的空字符串 (例如，如果存在多个连续空格)。
    return scopeString.split(' ').filter((s) => s.length > 0);
  }

  /**
   * 将 scope 字符串数组格式化为以空格分隔的单个字符串。
   * @param scopes - 包含一个或多个 scope 的字符串数组。
   * @returns 返回格式化后的 scope 字符串。
   */
  static formatScopes(scopes: string[]): string {
    return scopes.join(' '); // 使用空格连接数组中的所有 scope
  }

  // 方法重载签名，用于不同的验证场景
  // 场景1: 验证客户端请求的 scopes (需要异步查询数据库)
  static async validateScopes(
    scopes: string[], // 客户端请求的 scopes
    client: Client    // OAuth 客户端对象 (包含其允许的 scopes 等信息)
  ): Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>; // 返回 Promise
  // 场景2: 简单的 scopes 列表对比 (例如，验证 refresh_token 请求的 scope 是否超出原始范围)
  static validateScopes(
    requestedScopes: string[], // 请求的 scopes
    allowedScopes: string[]    // 允许的 scopes 列表
  ): { valid: boolean; invalidScopes: string[]; error_description?: string }; // 直接返回值
  /**
   * 验证请求的 scopes 是否有效。
   * 此方法有两个重载：
   * 1. (异步) 验证客户端 (Client对象) 请求的 scopes：
   *    - 检查请求的 scopes 是否在该客户端允许的 `allowedScopes` 范围内。
   *    - 检查这些 scopes 是否在全局 Scope 表中存在且处于活动状态。
   *    - 如果客户端是公共客户端 (isPublic)，则检查请求的 scopes 是否也都是公共的。
   * 2. (同步) 验证请求的 scopes 是否在给定的 `allowedScopes` 字符串数组中。
   * @param scopes - 客户端请求的 scope 字符串数组。
   * @param clientOrAllowedScopes - 可以是 OAuth 客户端对象 (Client) 或一个预定义的允许 scope 字符串数组。
   * @returns 返回一个对象，包含 `valid` (布尔值，指示是否所有 scopes 都有效) 和 `invalidScopes` (字符串数组，包含无效或不允许的 scopes)。
   *          对于异步验证，还可能包含 `error_description`。
   * @security 安全考虑: 严格验证 scope 对于防止权限提升和访问未授权资源至关重要。
   */
  static validateScopes(
    scopes: string[],
    clientOrAllowedScopes: Client | string[]
  ):
    | Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }> // 异步情况的返回类型
    | { valid: boolean; invalidScopes: string[]; error_description?: string } {       // 同步情况的返回类型
    // 如果请求的 scopes 为空，则认为有效 (通常客户端至少会请求一个 scope，如 'openid')。
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    // --- 同步验证逻辑 (当 clientOrAllowedScopes 是 string[] 时) ---
    // 适用于例如验证刷新令牌请求的 scope 是否未超出原始授予的范围。
    if (Array.isArray(clientOrAllowedScopes)) {
      // 找出在 scopes 中但不在 clientOrAllowedScopes (允许的范围) 中的项。
      const invalidScopes = scopes.filter((scope) => !clientOrAllowedScopes.includes(scope));
      return {
        valid: invalidScopes.length === 0, // 如果没有无效的 scope，则验证通过
        invalidScopes,
        error_description: invalidScopes.length > 0 ? `Requested scope(s) not in allowed list: ${invalidScopes.join(', ')}` : undefined,
      };
    }

    // --- 异步验证逻辑 (当 clientOrAllowedScopes 是 Client 对象时) ---
    // 适用于授权服务器在处理授权请求时验证客户端请求的 scopes。
    const client = clientOrAllowedScopes as Client; // 类型断言为 Client 对象

    // 返回一个立即执行的异步函数 (IIFE) 以便在方法签名中返回 Promise。
    return (async () => {
      // 步骤 1: 检查请求的 scopes 是否在客户端配置的 `allowedScopes` 范围内。
      let clientAllowedScopes: string[] = []; // 存储从客户端配置中解析出的允许 scopes
      if (client.allowedScopes) { // client.allowedScopes 通常是从数据库读取的 JSON 字符串
        try {
          clientAllowedScopes = JSON.parse(client.allowedScopes as string);
          if (!Array.isArray(clientAllowedScopes)) clientAllowedScopes = []; // 确保是数组
        } catch (e) {
          console.error('Failed to parse client.allowedScopes for client ID:', client.id, e);
          // 如果解析失败，为安全起见，视为空数组，意味着不允许任何 scope。
          clientAllowedScopes = [];
        }
      }

      // 筛选出那些请求了但未在客户端 `allowedScopes` 中列出的 scopes。
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

      // 步骤 2: 检查这些 (已通过客户端允许列表的) scopes 是否在全局 Scope 表中存在且处于活动状态。
      // 这确保了 scope 本身是系统定义的有效 scope。
      const validDbScopes = await prisma.scope.findMany({
        where: {
          name: { in: scopes }, // 仅查询客户端请求的 scopes
          isActive: true,       // 且必须是活动的
        },
      });
      const validScopeNamesFromDb = validDbScopes.map((s) => s.name); // 获取有效的 scope 名称列表
      // 筛选出那些请求了但在数据库中找不到或非活动的 scopes。
      const invalidOrInactiveScopes = scopes.filter(
        (scope) => !validScopeNamesFromDb.includes(scope)
      );

      if (invalidOrInactiveScopes.length > 0) {
        return {
          valid: false,
          invalidScopes: invalidOrInactiveScopes,
          error_description: `Requested scope(s) are invalid or inactive: ${invalidOrInactiveScopes.join(', ')}`,
        };
      }

      // 步骤 3: 对于公共客户端 (public clients)，确保它们请求的所有 (有效的) scopes 也都是标记为公共的。
      // 公共客户端通常不能请求敏感的、非公共的 scopes。
      if (client.isPublic) {
        // 从已验证的数据库 scopes 中，筛选出那些 `isPublic` 为 false 的。
        const nonPublicScopes = validDbScopes
          .filter((dbScope) => !dbScope.isPublic)
          .map((s) => s.name);
        if (nonPublicScopes.length > 0) {
          return {
            valid: false,
            invalidScopes: nonPublicScopes,
            error_description: `Public client requested non-public scope(s): ${nonPublicScopes.join(', ')}`,
          };
        }
      }

      // 如果所有检查都通过，则 scopes 有效。
      return { valid: true, invalidScopes: [] };
    })();
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含特定的必需 scope。
   * @param userScopes - 用户拥有的 scope 字符串数组。
   * @param requiredScope - 需要检查的单个 scope 字符串。
   * @returns 如果用户拥有该 scope 则返回 true，否则返回 false。
   */
  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所列必需 scopes 中的任何一个。
   * @param userScopes - 用户拥有的 scope 字符串数组。
   * @param requiredScopes - 一个包含多个必需 scope 的字符串数组。
   * @returns 如果用户至少拥有其中一个必需 scope 则返回 true，否则返回 false。
   */
  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => userScopes.includes(scope));
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所有指定的必需 scopes。
   * @param userScopes - 用户拥有的 scope 字符串数组。
   * @param requiredScopes - 一个包含多个必需 scope 的字符串数组。
   * @returns 如果用户拥有所有必需的 scopes 则返回 true，否则返回 false。
   */
  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
}

/**
 * JWT (JSON Web Token) 工具类。
 * 负责 Access Token, Refresh Token, 和 ID Token 的创建与验证。
 * 使用 'jose' 库进行 JWT 操作。
 * 依赖于环境变量来配置 JWT 签名密钥、签发者 (issuer)、受众 (audience) 等。
 */
export class JWTUtils {
  /**
   * (私有) 获取用于 JWT 签名的 RSA 私钥。
   * 私钥从环境变量 `JWT_PRIVATE_KEY_PEM` 中读取，应为 PKCS#8 PEM 格式。
   * @returns 返回一个 `jose.KeyLike` 对象，代表导入的私钥。
   * @throws Error 如果环境变量未设置或密钥格式无效。
   * @security 安全考虑: 私钥的保密至关重要。确保环境变量安全存储和访问。
   */
  private static async getRSAPrivateKeyForSigning(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PRIVATE_KEY_PEM; // 从环境变量读取 PEM 格式的私钥
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // 从环境变量读取签名算法，默认为 RS256

    if (!pem) {
      const errorMessage =
        'JWT_PRIVATE_KEY_PEM is not set. Please configure it via environment variables.';
      // 在生产环境中，严格要求配置，并记录错误。
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new Error(errorMessage);
      }
      // 在非生产环境中，也应记录错误并抛出，以便开发者注意。
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    try {
      // 使用 jose.importPKCS8 从 PEM 格式导入 PKCS#8 私钥。
      return await jose.importPKCS8(pem, algorithm as string); // 指定算法
    } catch (error) {
      console.error('Failed to import RSA private key (PKCS8):', error);
      throw new Error('Invalid RSA private key (JWT_PRIVATE_KEY_PEM) format or configuration.');
    }
  }

  /**
   * (私有) 获取用于 JWT 验证的 RSA 公钥。
   * 公钥从环境变量 `JWT_PUBLIC_KEY_PEM` 中读取，可以是 SPKI 或 X.509 PEM 格式。
   * 注意: 在分布式系统中，资源服务器通常通过 JWKS (JSON Web Key Set) 端点动态获取公钥，而不是从本地配置读取。
   * @returns 返回一个 `jose.KeyLike` 对象，代表导入的公钥。
   * @throws Error 如果环境变量未设置或密钥格式无效。
   */
  private static async getRSAPublicKeyForVerification(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PUBLIC_KEY_PEM; // 从环境变量读取 PEM 格式的公钥
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // 从环境变量读取签名算法

    if (!pem) {
      const errorMessage =
        'JWT_PUBLIC_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new Error(errorMessage);
      }
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    try {
      // 尝试以 SPKI (SubjectPublicKeyInfo) 格式导入公钥，这是常见的公钥 PEM 格式。
      return await jose.importSPKI(pem, algorithm as string);
    } catch (spkiError) {
      console.warn(
        'Failed to import RSA public key as SPKI, trying as X.509 certificate...',
        spkiError
      );
      try {
        // 如果 SPKI 导入失败 (例如，PEM 文件是完整的 X.509 证书)，则尝试作为 X.509 证书导入。
        return await jose.importX509(pem, algorithm as string);
      } catch (x509Error) {
        console.error('Failed to import RSA public key (SPKI or X.509):', x509Error);
        throw new Error(
          'Invalid RSA public key (JWT_PUBLIC_KEY_PEM) format or configuration. Supported formats: SPKI PEM, X.509 PEM.'
        );
      }
    }
  }

  /**
   * (私有) 获取 JWT 的签发者 (Issuer)。
   * 从环境变量 `JWT_ISSUER` 读取。如果未设置，在生产环境会抛出错误，
   * 在开发环境会使用一个基于 localhost 的默认值。
   * @returns JWT 签发者字符串。
   */
  private static getIssuer(): string {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_ISSUER is not set in production environment');
      }
      // 提供一个开发环境下的默认值
      return `http://localhost:${process.env.PORT || 3000}`;
    }
    return issuer;
  }

  /**
   * (私有) 获取 JWT 的受众 (Audience)。
   * 从环境变量 `JWT_AUDIENCE` 读取。如果未设置，在生产环境会抛出错误，
   * 在开发环境会使用一个默认值 'api_resource_dev'。
   * @returns JWT 受众字符串。
   */
  private static getAudience(): string {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_AUDIENCE is not set in production environment');
      }
      // 提供一个开发环境下的默认值
      return 'api_resource_dev';
    }
    return audience;
  }

  /**
   * 创建一个 Access Token。
   * @param payload - 包含 Access Token 声明的对象:
   *   - `client_id`: (必需) 客户端ID。
   *   - `user_id`: (可选) 用户ID。如果提供，则JWT的 `sub` (subject)声明将是用户ID；否则为客户端ID。
   *   - `scope`: (可选) 授予的权限范围字符串 (空格分隔)。
   *   - `permissions`: (可选)用户的具体权限列表。
   *   - `exp`: (可选) 过期时间表达式，例如 '1h' (1小时), '30d' (30天)。默认为 '1h'。
   * @returns 返回生成的 Access Token 字符串 (JWT)。
   * @security 安全考虑: Access Token 应具有较短的有效期 (例如1小时)。
   *           包含的 permissions 应基于用户和客户端的实际授权。
   */
  static async createAccessToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    permissions?: string[];
    exp?: string;
  }): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // 获取签名算法
    const keyId = process.env.JWT_KEY_ID || 'default-kid';   // 获取密钥ID (kid), 用于 JWKS

    // 构建 JWT 载荷 (payload)
    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,                           // 客户端ID
      sub: payload.user_id || payload.client_id,              // 主题: 用户ID或客户端ID
      aud: this.getAudience(),                                // 受众: 通常是API资源
      iss: this.getIssuer(),                                  // 签发者
      jti: crypto.randomUUID(),                               // JWT ID: 唯一标识符，用于防止重放攻击
      iat: Math.floor(Date.now() / 1000),                     // 签发时间 (Unix timestamp in seconds)
      scope: payload.scope,                                   // 授予的范围
      permissions: payload.permissions || [],                 // 用户权限列表
    };

    // 清理载荷中值为 undefined 的字段
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    // 创建并签名 JWT
    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId }) // 设置受保护的头部，包含算法和密钥ID
      .setExpirationTime(payload.exp || '1h')             // 设置过期时间，默认为1小时
      .sign(await this.getRSAPrivateKeyForSigning());     // 使用RSA私钥进行签名
  }

  /**
   * 为给定的令牌字符串生成 SHA256 哈希值。
   * 用于在数据库中存储令牌的哈希而不是原始令牌，以增强安全性。
   * @param token - 要哈希的令牌字符串。
   * @returns 返回令牌的 SHA256 哈希值的十六进制表示。
   */
  static getTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 验证 Access Token 的有效性。
   * 包括检查签名、过期时间、签发者 (iss) 和受众 (aud)。
   * @param token - 要验证的 Access Token 字符串。
   * @returns 返回一个对象，包含:
   *   - `valid`: (布尔值) 指示令牌是否有效。
   *   - `payload`: (可选) 如果有效，则为解码后的 JWT 载荷。
   *   - `error`: (可选) 如果无效，则为错误描述信息。
   */
  static async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // 获取签名算法
    try {
      // 使用 RSA 公钥和指定的验证选项来验证 JWT。
      const { payload } = await jose.jwtVerify(token, await this.getRSAPublicKeyForVerification(), {
        issuer: this.getIssuer(),     // 期望的签发者
        audience: this.getAudience(), // 期望的受众
        algorithms: [algorithm as string], // 允许的签名算法列表
      });

      // Check JTI blacklist
      if (payload.jti) {
        const blacklistedJti = await prisma.tokenBlacklist.findUnique({
          where: { jti: payload.jti },
        });
        if (blacklistedJti) {
          return { valid: false, error: 'Token has been revoked' };
        }
      }

      return { valid: true, payload }; // 验证成功
    } catch (error) { // 捕获验证过程中可能发生的任何错误
      let errorMessage = 'Token verification failed'; // 默认错误消息
      console.error('Access Token Verification Error:', error); // 在服务端记录详细错误

      // 根据错误类型提供更具体的错误描述
      if (error instanceof jose.errors.JWTExpired) {
        errorMessage = 'Token has expired'; // 令牌已过期
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        // 特定声明 (如 iss, aud) 验证失败
        errorMessage = `Token claim validation failed: ${error.claim} ${error.reason}`;
      } else if (
        error instanceof jose.errors.JWSInvalid || // JWS (签名) 结构无效
        error instanceof jose.errors.JWSSignatureVerificationFailed // 签名验证失败
      ) {
        errorMessage = 'Invalid token or signature';
      }
      // 其他 jose 错误类型 (如 JWKInvalid, JOSENotSupported) 也会被捕获

      return { valid: false, error: errorMessage }; // 验证失败
    }
  }

  /**
   * 创建一个 Refresh Token。
   * @param payload - 包含 Refresh Token 声明的对象:
   *   - `client_id`: (必需) 客户端ID。
   *   - `user_id`: (可选) 用户ID。
   *   - `scope`: (可选) 原始授予的权限范围。
   *   - `exp`: (可选) 过期时间表达式，例如 '30d'。默认为 '30d'。
   * @returns 返回生成的 Refresh Token 字符串 (JWT)。
   * @security 安全考虑: Refresh Token 应具有比 Access Token 更长的有效期。
   *           应安全存储，并考虑实施刷新令牌轮换 (Rotation) 机制。
   */
  static async createRefreshToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    exp?: string;
  }): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      sub: payload.user_id || payload.client_id,
      aud: this.getAudience(), // 刷新令牌的受众通常与访问令牌相同或特定于令牌端点
      iss: this.getIssuer(),
      jti: crypto.randomUUID(), // 唯一 JWT ID
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      token_type: 'refresh', // 自定义声明，明确指示这是一个刷新令牌 (有助于区分)
    };
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(payload.exp || '30d') // 刷新令牌有效期通常较长，例如30天
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 验证 Refresh Token 的有效性。
   * @param token - 要验证的 Refresh Token 字符串。
   * @returns 返回一个对象，包含:
   *   - `valid`: (布尔值) 指示令牌是否有效。
   *   - `payload`: (可选) 如果有效，则为解码后的 JWT 载荷。
   *   - `error`: (可选) 如果无效，则为错误描述信息。
   */
  static async verifyRefreshToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    try {
      const { payload } = await jose.jwtVerify(token, await this.getRSAPublicKeyForVerification(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
        algorithms: [algorithm as string],
      });

      // (重要) 额外检查: 确保这确实是一个用于刷新的令牌 (例如通过自定义的 'token_type' 声明)
      if (payload.token_type !== 'refresh') {
        console.warn('Invalid token type for refresh token verification:', payload.token_type);
        return { valid: false, error: 'Invalid token type: expected refresh token' };
      }

      // Check JTI blacklist
      if (payload.jti) {
        const blacklistedJti = await prisma.tokenBlacklist.findUnique({
          where: { jti: payload.jti },
        });
        if (blacklistedJti) {
          return { valid: false, error: 'Refresh token has been revoked' };
        }
      }

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Refresh token verification failed';
      console.error('Refresh Token Verification Error:', error);

      if (error instanceof jose.errors.JWTExpired) {
        errorMessage = 'Refresh token has expired';
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        errorMessage = `Refresh token claim validation failed: ${error.claim} ${error.reason}`;
      } else if (
        error instanceof jose.errors.JWSInvalid ||
        error instanceof jose.errors.JWSSignatureVerificationFailed
      ) {
        errorMessage = 'Invalid refresh token or signature';
      }
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * 创建一个 ID Token (用于 OpenID Connect 流程)。
   * ID Token 是一个 JWT，它包含了关于用户身份认证的信息。
   * @param user - (必需) User 对象，包含用户信息。
   * @param client - (必需) Client 对象，代表请求身份认证的客户端。
   * @param nonce - (可选) 客户端在授权请求中提供的 nonce 值，ID Token 中必须原样返回以防止重放攻击。
   * @returns 返回生成的 ID Token 字符串 (JWT)。
   * @security 安全考虑: ID Token 的受众 (aud) 必须是客户端的 client_id。
   *           `nonce` 的使用对于防止重放攻击很重要。
   */
  static async createIdToken(user: User, client: Client, nonce?: string): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      iss: this.getIssuer(),                             // 签发者: 认证服务器的 URL
      sub: user.id,                                      // 主题: 用户的唯一标识符
      aud: client.clientId,                              // 受众: 客户端的 client_id
      exp: Math.floor(Date.now() / 1000) + (60 * 60),    // 过期时间: 通常为1小时 (Unix timestamp)
      iat: Math.floor(Date.now() / 1000),                // 签发时间 (Unix timestamp)
      jti: crypto.randomUUID(),                          // JWT ID: 唯一标识符

      // --- OIDC 标准声明 (Standard Claims) ---
      email: user.email,                                 // 用户的 email 地址
      email_verified: user.emailVerified ?? false,       //用户的 email 是否已验证
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined, // 用户全名
      given_name: user.firstName || undefined,           // 用户名
      family_name: user.lastName || undefined,           // 用户姓
      preferred_username: user.username || undefined,    // 用户的首选用户名 (如果存在)

      // 如果授权请求中提供了 nonce，则必须在 ID Token 中原样返回。
      // Nonce 用于关联客户端会话与 ID Token，并减轻重放攻击。
      nonce: nonce,
    };

    // 移除所有值为 undefined 的声明，以保持载荷的整洁。
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId }) // 设置头部，包含算法和密钥ID
      .sign(await this.getRSAPrivateKeyForSigning());     // 使用RSA私钥签名
  }
}

/**
 * 客户端认证 (Client Authentication) 工具类。
 * 负责在令牌端点 (Token Endpoint) 验证客户端的身份。
 * 支持多种客户端认证方法，如:
 * - HTTP Basic Authentication (client_id 和 client_secret 在 Authorization header 中)。
 * - 请求体参数 (client_id 和 client_secret 在请求体中)。
 * - JWT 客户端断言 (client_assertion 和 client_assertion_type，例如 private_key_jwt)。
 * - 公共客户端 (Public clients)，它们不使用密钥进行认证。
 */
export class ClientAuthUtils {
  /**
   * 认证客户端。
   * 此方法会尝试从 Authorization header (HTTP Basic) 或请求体中提取客户端凭据。
   * 也会处理 JWT 客户端断言和公共客户端的情况。
   * @param request - NextRequest 对象。
   * @param body - 解析后的请求体 FormData 对象 (因为令牌端点通常使用 x-www-form-urlencoded)。
   * @returns 返回一个 Promise，解析为一个对象:
   *   - `client`: 如果认证成功，则为 Client (OAuthClient) 对象；否则为 null。
   *   - `error`: (可选) 如果认证失败，则为一个 OAuth2Error 对象，包含错误信息。
   * @security 安全考虑: 客户端凭据 (如 client_secret) 的传输和存储必须安全。
   *           对于 JWT 断言，需要验证其签名和声明。
   */
  static async authenticateClient(
    request: NextRequest, // Next.js HTTP 请求对象
    body: FormData        // 解析后的请求体 (通常是表单数据)
  ): Promise<{
    client: Client | null; // Client 是 OAuthClient 的别名
    error?: OAuth2Error;   // OAuth 2.0 标准错误对象
  }> {
    // 从请求体中尝试获取 client_id 和 client_secret
    let client_id = body.get('client_id') as string;
    let client_secret = body.get('client_secret') as string;
    // 获取 JWT 客户端断言相关的参数
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // --- 步骤 1: 检查 HTTP Basic Authentication ---
    // (RFC 6749, Section 2.3.1)
    // 客户端可以使用 HTTP Basic Authentication 将其 client_id 和 client_secret 放在 Authorization header 中。
    const authHeader = request.headers.get('authorization'); // 获取 Authorization header
    if (authHeader && authHeader.toLowerCase().startsWith('basic ')) { // 检查是否以 'Basic ' 开头
      try {
        const base64Credentials = authHeader.slice(6); // 移除 'Basic ' 前缀，获取 Base64 编码的凭据
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8'); // Base64 解码
        const [basicClientId, basicClientSecret] = credentials.split(':'); // 按 ':' 分割 client_id 和 client_secret

        if (basicClientId && basicClientSecret) {
          // 如果请求体中也提供了 client_id/secret，Basic Auth 优先。
          // 但通常不应混合使用。这里简单地允许表单数据覆盖（如果表单数据也存在）。
          // 更严格的实现可能会禁止混合。
          client_id = client_id || basicClientId;
          client_secret = client_secret || basicClientSecret;
        }
      } catch { // Base64 解码或分割失败
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid Basic authentication header format.',
          },
        };
      }
    }

    // --- 步骤 2: 检查 JWT 客户端断言 (Client Assertion) ---
    // (RFC 7523: JWT Profile for OAuth 2.0 Client Authentication and Authorization Grants)
    // 例如 'private_key_jwt' 方法，客户端使用其私钥签署一个 JWT 作为断言。
    if (
      client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' && // 标准断言类型
      client_assertion // 断言 JWT 本身
    ) {
      // 如果存在 JWT 断言，则优先使用此方法进行认证。
      return await this.authenticateWithJWT(client_assertion, request);
    }

    // --- 步骤 3: 检查 client_id 和 client_secret (来自请求体或 Basic Auth) ---
    // 这是传统的 client_secret_post 或 client_secret_basic (如果从header解析得到) 认证方法。
    if (client_id && client_secret) {
      return await this.authenticateWithSecret(client_id, client_secret);
    }

    // --- 步骤 4: 处理公共客户端 (Public Clients) ---
    // 公共客户端没有 client_secret，它们通过 client_id 标识自身，但不进行严格的密钥认证。
    // 通常与 PKCE 结合使用以增强安全性。
    if (client_id && !client_secret) { // 只提供了 client_id，没有 client_secret
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: client_id, isActive: true }, // 查找活动的客户端
      });

      if (!client) { // 客户端未找到
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not found.',
          },
        };
      }

      // 如果找到的客户端并非注册为公共客户端 (isPublic 为 false)，
      // 却尝试进行公共客户端认证 (即未提供 secret)，则认证失败。
      if (!client.isPublic) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT, // 或 UNAUTHORIZED_CLIENT
            error_description: 'Client is not a public client and requires authentication.',
          },
        };
      }

      // 公共客户端认证成功 (仅基于 client_id 识别)
      return { client };
    }

    // --- 如果以上所有方法都未满足，则认为客户端认证失败 ---
    return {
      client: null,
      error: {
        error: OAuth2ErrorTypes.INVALID_CLIENT,
        error_description: 'Client authentication required but not provided or method not supported.',
      },
    };
  }

  /**
   * (私有) 使用 client_id 和 client_secret 进行认证。
   * @param clientId - 客户端ID。
   * @param clientSecret - 客户端密钥。
   * @returns 认证结果。
   */
  private static async authenticateWithSecret(
    clientId: string,
    clientSecret: string
  ): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    // 从数据库查找客户端
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId, isActive: true }, // 确保客户端是活动的
    });

    if (!client) { // 客户端不存在
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Invalid client ID or client not active.',
        },
      };
    }

    // 安全检查: 公共客户端不应该有 client_secret 或使用此方法认证。
    if (client.isPublic) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Public client attempted to authenticate with a secret.',
        },
      };
    }

    // 检查客户端是否配置了 client_secret。
    if (!client.clientSecret) {
      console.error(`Client ${clientId} is missing clientSecret in database.`);
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT, // 或 SERVER_ERROR，取决于策略
          error_description: 'Client secret not configured for this client.',
        },
      };
    }

    // 验证提供的 client_secret 是否与数据库中存储的哈希匹配。
    // 使用 bcrypt 进行安全的哈希比较。
    try {
      const bcrypt = await import('bcrypt'); // 动态导入 bcrypt
      const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);

      if (!isValidSecret) { // 密钥不匹配
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid client secret.',
          },
        };
      }
    } catch (error) { // bcrypt 比较过程中发生错误
      console.error('Error during bcrypt.compare for client secret validation:', error);
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.SERVER_ERROR, // 内部服务器错误
          error_description: 'Error during client secret validation.',
        },
      };
    }

    // 检查客户端密钥是否已过期 (如果设置了过期时间)。
    if (client.clientSecretExpiresAt && client.clientSecretExpiresAt < new Date()) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client secret has expired.',
        },
      };
    }

    // 客户端认证成功
    return { client };
  }

  /**
   * (私有) 使用 JWT 客户端断言进行认证。
   * @param assertion - 客户端提供的 JWT 断言。
   * @param request - NextRequest 对象，用于获取令牌端点 URL (作为 JWT 的受众)。
   * @returns 认证结果。
   * @security 安全考虑: 严格验证 JWT 的签名、声明 (iss, sub, aud, exp) 和 jwksUri。
   */
  private static async authenticateWithJWT(
    assertion: string, // JWT 断言字符串
    request: NextRequest // 当前 HTTP 请求
  ): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    try {
      // 步骤 1: 解码 JWT (不验证签名，仅获取声明以便查找客户端)
      const decodedJwt = jose.decodeJwt(assertion);

      // 验证 JWT 断言的基本结构: iss 和 sub 声明必须存在且相等，代表客户端ID。
      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid JWT assertion: iss and sub claims are required and must be identical (client_id).',
          },
        };
      }

      const clientId = decodedJwt.iss as string; // iss (Issuer) 即为 client_id
      // 步骤 2: 根据 client_id 从数据库查找客户端
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId, isActive: true }, // 确保客户端活动
      });

      if (!client) { // 客户端未找到
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client specified in JWT assertion not found or not active.',
          },
        };
      }

      // 步骤 3: 检查客户端是否配置了 jwksUri (用于获取验证签名的公钥)
      if (!client.jwksUri) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client is not configured for JWT assertion-based authentication (missing jwks_uri).',
          },
        };
      }

      // 步骤 4: 验证 JWT 断言
      // 获取令牌端点的 URL，它将作为 JWT 断言的预期受众 (audience)。
      const tokenEndpointUrl = this.getTokenEndpointUrl(request);
      // 创建一个远程 JWKSet，用于从客户端的 jwksUri 获取公钥。
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      // 使用 jose.jwtVerify 验证 JWT 的签名和声明。
      await jose.jwtVerify(assertion, JWKS, {
        issuer: clientId,             // 期望签发者为 client_id
        audience: tokenEndpointUrl,   // 期望受众为令牌端点 URL
        algorithms: ['RS256', 'ES256', 'PS256'], // 支持的签名算法列表 (根据客户端能力配置)
        // `exp` (过期时间), `nbf` (Not Before), `jti` (JWT ID) 等标准声明由 `jwtVerify` 自动处理。
      });

      // JWT 断言验证成功
      return { client };
    } catch (error) { // JWT 验证失败 (例如签名无效、过期、声明不匹配、JWKS 获取失败等)
      console.error('Client JWT assertion validation failed:', error);
      let errorDescription = 'Client assertion validation failed.';
      if (error instanceof jose.errors.JWTExpired) errorDescription = 'Client assertion has expired.';
      else if (error instanceof jose.errors.JWTClaimValidationFailed) errorDescription = `Client assertion claim validation failed: ${error.claim} ${error.reason}.`;
      else if (error instanceof jose.errors.JWSSignatureVerificationFailed) errorDescription = 'Client assertion signature verification failed.';
      // ... 其他 jose 错误处理

      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: errorDescription,
        },
      };
    }
  }

  /**
   * (私有) 获取当前请求的令牌端点 URL。
   * 用于 JWT 客户端断言的受众 (audience) 验证。
   * @param request - NextRequest 对象。
   * @returns 令牌端点的完整 URL 字符串。
   */
  private static getTokenEndpointUrl(request: NextRequest): string {
    const requestUrl = new URL(request.url); // 当前请求的 URL
    // 尝试从 x-forwarded-* headers (通常由反向代理设置) 获取协议和主机，以正确反映外部访问的 URL。
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') || requestUrl.host;
    // 假设令牌端点固定为 /api/oauth/token (应与实际路由匹配)
    return `${protocol}://${host}/api/oauth/token`;
  }
}

/**
 * 授权 (Authorization) 工具类。
 * 包含与授权流程相关的各种辅助函数，例如验证重定向URI、生成授权码、记录审计事件等。
 */
export class AuthorizationUtils {
  /**
   * 验证提供的 redirect_uri 是否在客户端注册的 redirect_uris 列表中。
   * @param redirectUri - 客户端在请求中提供的 redirect_uri。
   * @param registeredUris - 从客户端配置中获取的已注册 redirect_uri 列表。
   * @returns 如果验证通过则返回 true，否则返回 false。
   * @security 安全考虑: 这是防止开放重定向 (Open Redirect) 攻击的关键步骤。
   *           授权服务器必须确保只重定向到预先注册和验证过的 URI。
   */
  static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
    return registeredUris.includes(redirectUri); // 简单地检查 URI 是否在列表中
    // TODO: 对于更复杂的场景 (例如允许通配符或路径参数的 redirect_uri)，需要更复杂的匹配逻辑。
  }

  /**
   * 验证 response_type 是否是服务器支持的类型。
   * 对于授权码流程，通常只支持 'code'。
   * @param responseType - 客户端请求的 response_type。
   * @param supportedTypes - 服务器支持的 response_type 列表，默认为 ['code']。
   * @returns 如果支持则返回 true，否则返回 false。
   */
  static validateResponseType(responseType: string, supportedTypes: string[] = ['code']): boolean {
    return supportedTypes.includes(responseType);
  }

  /**
   * 生成一个随机的 state 参数值。
   * state 参数用于客户端维护请求和回调之间的状态，并可用于防止 CSRF 攻击。
   * @returns 返回一个 Base64URL 编码的随机字符串。
   */
  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个随机的 nonce 参数值 (主要用于 OpenID Connect)。
   * Nonce 用于关联客户端会话与 ID Token，并防止重放攻击。
   * @returns 返回一个 Base64URL 编码的随机字符串。
   */
  static generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个安全的随机授权码 (Authorization Code)。
   * 授权码应具有足够的熵，难以猜测，且通常是短暂和一次性的。
   * @returns 返回一个十六进制编码的随机字符串。
   */
  static generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex'); // 生成32字节 (256位) 的随机数据，并转为十六进制字符串
  }

  /**
   * 记录审计事件到数据库。
   * 用于追踪重要的安全相关活动，例如登录尝试、令牌颁发、权限变更等。
   * @param event - 包含审计事件详细信息的对象:
   *   - `userId`: (可选) 相关用户的ID。
   *   - `clientId`: (可选) 相关客户端的ID (通常是数据库中的 CUID/UUID，而不是字符串 client_id)。
   *   - `action`: (必需) 事件动作的描述字符串 (例如, 'user_login_success', 'token_issued')。
   *   - `resource`: (可选) 事件相关的资源标识。
   *   - `ipAddress`: (可选) 请求来源的 IP 地址。
   *   - `userAgent`: (可选) 请求的 User-Agent 字符串。
   *   - `success`: (必需) 指示操作是否成功。
   *   - `errorMessage`: (可选) 如果操作失败，则为错误信息。
   *   - `metadata`: (可选) 包含其他相关数据的对象，将作为 JSON 字符串存储。
   * @returns 返回一个 Promise<void>。如果记录失败，会在控制台打印错误。
   * @security 安全考虑: 审计日志对于安全监控、事件响应和合规性非常重要。
   *           应确保记录足够的信息，并保护审计日志本身的安全。
   */
  static async logAuditEvent(event: {
    userId?: string;
    clientId?: string; // 注意: 此处期望的是 Client 表的 ID (CUID/UUID)，而不是字符串 clientId
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      // 验证提供的 userId 是否存在于数据库中 (如果提供了 userId)
      let validUserId: string | null = null;
      if (event.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: event.userId },
          select: { id: true }, // 仅选择 id 以提高效率
        });
        validUserId = userExists ? event.userId : null;
        if (!userExists) console.warn(`Audit log: User ID ${event.userId} not found.`);
      }

      // 验证提供的 clientId 是否存在于数据库中 (如果提供了 clientId)
      // **重要**: 此处假设 event.clientId 是 OAuthClient 表的主键 ID (通常是 CUID 或 UUID)。
      // 如果 event.clientId 是字符串形式的 client_id (例如 "my-app-client")，则查询条件应为 `where: { clientId: event.clientId }`。
      // 当前代码中，如果 event.clientId 是字符串 client_id，会导致查询失败，除非它恰好也是主键ID。
      let validClientIdForDb: string | null = null; // 这是指 OAuthClient 表的 ID (CUID/UUID)
      if (event.clientId) {
        // 假设 event.clientId 可能传入的是字符串 clientId 或数据库 OAuthClient.id
        // 我们需要确定 actorId 应该是什么。通常 actorId 指的是执行操作的实体。
        // 如果 event.clientId 是字符串形式的 "my-app-client"
        const clientRecordByStringId = await prisma.oAuthClient.findUnique({ where: { clientId: event.clientId }});
        if (clientRecordByStringId) {
            validClientIdForDb = clientRecordByStringId.id; // 使用数据库的 CUID/UUID
        } else {
            // 如果不是字符串ID，尝试作为 CUID/UUID 查找
            const clientRecordByCuid = await prisma.oAuthClient.findUnique({ where: {id: event.clientId }});
            if (clientRecordByCuid) {
                validClientIdForDb = clientRecordByCuid.id;
            } else {
                 console.warn(`Audit log: Client with identifier ${event.clientId} not found.`);
            }
        }
      }

      // 确定操作者类型和ID
      let actorType: string = 'SYSTEM'; // 默认为系统操作
      let actorId: string | null = null;   // 操作者ID (可以是 User ID 或 Client 的字符串 ID)

      if (validUserId) {
        actorType = 'USER';
        actorId = validUserId; // 用户ID作为操作者ID
      } else if (validClientIdForDb) { // 如果有有效的客户端数据库ID
        actorType = 'CLIENT';
        // 对于 actorId，通常希望记录的是可读的 clientId 字符串，而不是内部 CUID。
        // 这取决于 AuditLog 表中 actorId 的设计意图。
        // 如果 event.clientId 本身就是字符串 clientId (e.g., "my-app-client"), 则可以直接使用。
        // 如果 event.clientId 是 CUID, 需要从 clientRecordByCuid 获取其字符串 clientId。
        const clientForActorId = await prisma.oAuthClient.findUnique({ where: { id: validClientIdForDb }});
        actorId = clientForActorId ? clientForActorId.clientId : event.clientId; // 使用字符串clientId作为actorId
      }

      // 创建审计日志记录
      await prisma.auditLog.create({
        data: {
          userId: validUserId, // 关联到 User 表的ID (外键)
          clientId: validClientIdForDb, // 关联到 OAuthClient 表的ID (外键)
          action: event.action,
          resource: event.resource || null,
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          success: event.success,
          errorMessage: event.errorMessage || null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null, // 元数据转为JSON字符串存储
          actorType: actorType, // 操作者类型: USER, CLIENT, SYSTEM
          actorId: actorId,     // 操作者ID
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error); // 记录审计日志本身的失败
    }
  }

  /**
   * 获取用户的有效权限列表。
   * 此方法现在委托给 PermissionService 来处理权限的计算 (例如，合并直接权限和通过角色获得的权限)。
   * @param userId - 用户的ID。
   * @returns 返回一个包含用户所有有效权限名称的字符串数组。如果用户ID无效或用户无权限，则返回空数组。
   */
  static async getUserPermissions(userId: string): Promise<string[]> {
    if (!userId) {
      // console.warn('AuthorizationUtils.getUserPermissions called with no userId');
      return []; // 如果 userId 为空，直接返回空权限列表
    }
    // 调用 PermissionService 获取用户的有效权限集合 (Set<string>)。
    const permissionsSet = await permissionService.getUserEffectivePermissions(userId);
    // 将 Set<string> 转换为 string[] 以符合原方法签名。
    return Array.from(permissionsSet);
  }
}

// 导入自定义的 ApiError 类，用于标准化的API错误处理。
import { ApiError } from '../api/errorHandler';

/**
 * 速率限制 (Rate Limiting) 工具类。
 * 提供一个简单的内存速率限制机制，用于防止滥用API端点。
 * 注意: 这是一个基础的内存实现，不适用于分布式环境或需要持久化状态的场景。
 * 在生产环境中，应考虑使用更健壮的解决方案，如 Redis 支持的速率限制器。
 */
export class RateLimitUtils {
  // 使用 Map 存储每个 key (例如 IP 地址或客户端ID) 的请求计数和重置时间。
  // 结构: key -> { count: number, resetTime: number (Unix timestamp in ms) }
  private static requests = new Map<string, { count: number; resetTime: number }>();

  /**
   * 检查给定的 key 是否已达到速率限制。
   * @param key - 用于识别请求来源的唯一字符串 (例如 IP 地址)。
   * @param maxRequests - 在时间窗口内允许的最大请求数，默认为100。
   * @param windowMs - 时间窗口的毫秒数，默认为60000 (1分钟)。
   * @returns 如果请求被限制则返回 true，否则返回 false。
   */
  static isRateLimited(
    key: string,
    maxRequests: number = 100, // 在 windowMs 内允许的最大请求数
    windowMs: number = 60000   // 时间窗口 (毫秒)
  ): boolean {
    // --- 旁路条件 ---
    // 在测试环境、或特定环境变量禁用速率限制、或来源是测试IP/本地IP/未知IP时，不进行速率限制。
    // 这有助于开发和测试。
    if (
      process.env.NODE_ENV === 'test' ||                   // 测试环境
      process.env.DISABLE_RATE_LIMITING === 'true' ||      // 通过环境变量禁用
      key.startsWith('test-') ||                           // 测试 key 前缀
      key.includes('192.168.') || key.includes('127.0.0.1') || // 本地网络 IP
      key === 'unknown'                                    // 未知 IP
    ) {
      return false; // 不限制
    }

    const now = Date.now(); // 当前时间戳
    const record = this.requests.get(key); // 获取该 key 的请求记录

    // 如果没有记录，或者记录已过期 (当前时间 > 重置时间)
    if (!record || now > record.resetTime) {
      // 创建新记录或重置旧记录
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return false; // 未达到限制
    }

    // 如果请求计数已达到或超过最大允许数
    if (record.count >= maxRequests) {
      return true; // 已达到限制
    }

    // 请求计数增加，并更新记录
    record.count++;
    // this.requests.set(key, record); // Map中的对象是引用，所以直接修改record.count即可
    return false; // 未达到限制
  }

  /**
   * 根据请求和类型生成速率限制的 key。
   * @param request - NextRequest 对象。
   * @param type - 限制类型，'ip' (基于IP地址) 或 'client' (基于客户端ID，需要实现提取逻辑)，默认为 'ip'。
   * @returns 返回用于速率限制的 key 字符串。
   */
  static getRateLimitKey(request: NextRequest, type: 'client' | 'ip' = 'ip'): string {
    if (type === 'ip') {
      // 尝试从常见的代理 headers 中获取真实 IP 地址。
      // 'x-forwarded-for' 可能包含多个 IP (client, proxy1, proxy2)，通常第一个是真实客户端IP。
      // 'x-real-ip' 通常由 Nginx 等代理设置。
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() || // 获取 x-forwarded-for 的第一个 IP
        request.headers.get('x-real-ip') ||
        request.ip || // NextRequest.ip (可能需要特定配置才能获取)
        'unknown'; // 如果无法获取 IP，则使用 'unknown'

      // 为测试环境的 IP 添加前缀，以便区分和管理。
      if (process.env.NODE_ENV === 'test') {
        return `test-${ip}`;
      }
      return ip;
    }

    // 如果是基于客户端的速率限制 (type === 'client')
    // 此处需要实现从请求中提取 client_id 的逻辑。
    // 例如: const clientId = extractClientIdFromRequest(request); return `client-${clientId}`;
    // 为简化示例，此处返回一个通用 key。
    // 实际应用中，应确保能唯一标识客户端。
    console.warn("Client-based rate limiting key generation is placeholder. Implement actual client ID extraction.");
    return 'client-rate-limit-placeholder';
  }

  /**
   * 清除所有速率限制缓存。
   * 主要用于测试环境中重置状态。不应在生产环境中常规调用。
   */
  static clearCache(): void {
    this.requests.clear();
    console.log("Rate limit cache cleared.");
  }

  /**
   * (仅用于测试) 设置特定的速率限制状态。
   * @param key - 限制 key。
   * @param count - 当前请求计数。
   * @param resetTime - 重置时间戳。
   */
  static setTestRateLimit(key: string, count: number, resetTime: number): void {
    // 确保此方法只在测试环境中使用，避免影响生产。
    if (process.env.NODE_ENV === 'test') {
      this.requests.set(key, { count, resetTime });
    } else {
      console.warn("setTestRateLimit called outside of test environment. Operation ignored.");
    }
  }
}

/**
 * 封装刷新令牌 (refresh_token) 授权类型的核心处理逻辑。
 * 此函数被令牌端点 (token endpoint) 调用，当 grant_type 为 'refresh_token' 时。
 * 主要职责:
 * 1. 验证刷新令牌的有效性 (结构、签名、是否存在于数据库、是否已撤销、是否过期、是否属于当前客户端)。
 * 2. 处理范围 (scope) 参数: 允许客户端请求与原始授予范围相同或更窄的范围。
 * 3. 生成新的访问令牌 (Access Token)。
 * 4. 实现刷新令牌轮换 (Refresh Token Rotation): 使当前刷新令牌失效，并颁发一个新的刷新令牌。
 * 5. 存储新的访问令牌和新的刷新令牌到数据库。
 * 6. 记录审计事件。
 * @param refreshTokenValue - 客户端提供的刷新令牌字符串。
 * @param requestedScope - (可选) 客户端请求的新范围 (字符串，空格分隔)。
 * @param client - (必需) 已通过认证的 OAuthClient 对象。
 * @param ipAddress - (可选) 请求来源的 IP 地址，用于审计。
 * @param userAgent - (可选) 请求的 User-Agent，用于审计。
 * @returns 返回一个 Promise，解析为一个包含新令牌信息的对象。
 * @throws ApiError 如果验证失败或处理过程中发生错误，会抛出 ApiError 异常。
 * @security 安全考虑: 刷新令牌轮换是关键的安全增强，有助于检测和缓解刷新令牌泄露的风险。
 *           严格验证范围，防止权限提升。
 */
export async function processRefreshTokenGrantLogic(
  refreshTokenValue: string,        // 客户端提交的刷新令牌
  requestedScope: string | undefined, // 客户端可能请求的、更窄的范围
  client: Client,                   // 已认证的客户端对象
  ipAddress?: string,               // 请求IP，用于审计
  userAgent?: string                // 请求User-Agent，用于审计
): Promise<{
  accessToken: string;      // 新的访问令牌
  tokenType: string;        // 令牌类型 (Bearer)
  expiresIn: number;        // 新访问令牌的有效期 (秒)
  newRefreshToken: string;  // 新的刷新令牌 (由于轮换机制)
  scope?: string;           // 最终授予的范围
}> {
  // --- 步骤 1: 验证刷新令牌的 JWT 结构和签名 ---
  const verification = await JWTUtils.verifyRefreshToken(refreshTokenValue);
  if (!verification.valid || !verification.payload) {
    // 记录失败的审计事件
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id, // 使用客户端数据库ID
      action: 'invalid_refresh_token_structure_signature',
      resource: 'oauth/token_logic_refresh', // 标记来源
      ipAddress,
      userAgent,
      success: false,
      errorMessage: verification.error || 'Refresh token JWT verification failed (structure/signature).',
      metadata: { grantType: 'refresh_token', providedTokenValue: refreshTokenValue.substring(0, 20) + "..." }, // 只记录部分令牌以保护隐私
    });
    // 抛出标准 OAuth 错误
    throw new ApiError(
      400, // HTTP 状态码 Bad Request
      verification.error || 'Invalid refresh token.', // 错误描述
      OAuth2ErrorTypes.INVALID_GRANT // OAuth 错误代码
    );
  }

  // --- 步骤 2: 检查刷新令牌是否存在于数据库、是否有效且属于当前客户端 ---
  // 使用刷新令牌的哈希值进行查找，而不是原始令牌字符串。
  const refreshTokenHashToVerify = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHashToVerify, // 根据哈希查找
      isRevoked: false,                    // 确保未被撤销
      expiresAt: { gt: new Date() },       // 确保未过期 (大于当前时间)
      clientId: client.id,                 // (关键) 确保此刷新令牌是颁发给当前认证的客户端的
    },
  });

  // 如果数据库中未找到匹配的、有效的刷新令牌
  if (!storedRefreshToken) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'refresh_token_not_found_revoked_expired_or_mismatched_client',
      resource: 'oauth/token_logic_refresh',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Refresh token not found in database, or it has been revoked, expired, or was not issued to this client.',
      metadata: { grantType: 'refresh_token', tokenHashAttempted: refreshTokenHashToVerify },
    });
    // 安全增强: 如果一个无法识别或已失效的刷新令牌被使用，可能指示令牌泄露或重放攻击。
    // OAuth 2.0 BCP 建议在这种情况下，如果服务器能够识别出这个令牌属于某个已知的令牌家族（例如通过 previousTokenId 链），
    // 则应撤销该令牌家族中的所有令牌。此处的实现较为简单，仅拒绝请求。
    throw new ApiError(
      400,
      'Refresh token is invalid, expired, has been revoked, or was not issued to the authenticated client.',
      OAuth2ErrorTypes.INVALID_GRANT
    );
  }

  // (此 clientId 检查已包含在上面的数据库查询中，但保留显式检查作为双重保险或逻辑清晰性)
  // if (storedRefreshToken.clientId !== client.id) { ... }

  // --- 步骤 3: 处理范围 (Scope) 参数 ---
  // 客户端在使用刷新令牌时，可以请求与原始授予范围相同或更窄的范围。
  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope ?? ''); // 解析存储的原始范围
  let finalGrantedScope = storedRefreshToken.scope ?? undefined; // 最终授予的范围，默认为原始范围

  if (requestedScope) { // 如果客户端在刷新请求中提供了新的 scope 参数
    const requestedScopeArray = ScopeUtils.parseScopes(requestedScope);
    // 验证请求的新范围是否是原始范围的子集
    const scopeValidation = ScopeUtils.validateScopes(requestedScopeArray, originalScopes);
    if (!scopeValidation.valid) { // 如果请求的范围无效或超出了原始范围
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        userId: storedRefreshToken.userId ?? undefined,
        action: 'refresh_token_invalid_scope_requested',
        resource: 'oauth/token_logic_refresh',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Requested scope ('${requestedScope}') is invalid or exceeds originally granted scope ('${storedRefreshToken.scope}'). Invalid parts: ${scopeValidation.invalidScopes.join(', ')}`,
        metadata: { grantType: 'refresh_token', requestedScope, originalScope: storedRefreshToken.scope },
      });
      throw new ApiError(
        400,
        'Requested scope is invalid or exceeds the scope originally granted to the refresh token.',
        OAuth2ErrorTypes.INVALID_SCOPE
      );
    }
    finalGrantedScope = requestedScope; // 如果验证通过，则最终授予的范围是客户端请求的（可能缩小的）范围
  }

  // --- 步骤 4: 获取用户权限 (如果刷新令牌与用户关联) ---
  let permissions: string[] = [];
  if (storedRefreshToken.userId) { // 如果刷新令牌是用户相关的
    permissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);
  }

  // --- 步骤 5: 生成新的访问令牌 ---
  const newAccessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId, // 使用已认证客户端的 client_id 字符串
    user_id: storedRefreshToken.userId ?? undefined, // 如果是用户相关的刷新令牌，则包含 user_id
    scope: finalGrantedScope,   // 最终授予的范围
    permissions,                // 用户权限
    // exp: '1h' // JWTUtils.createAccessToken 中有默认过期时间
  });
  const newAccessTokenHash = JWTUtils.getTokenHash(newAccessToken);

  // --- 步骤 6: 在数据库中存储新的访问令牌记录 ---
  await prisma.accessToken.create({
    data: {
      token: newAccessToken, // 考虑是否仅存储哈希值 (取决于安全策略和是否需要检索原始令牌)
      tokenHash: newAccessTokenHash,
      clientId: client.id, // 关联到客户端的数据库ID
      userId: storedRefreshToken.userId ?? undefined, // 关联到用户的数据库ID (如果存在)
      scope: finalGrantedScope,
      expiresAt: addHours(new Date(), 1), // 与 JWTUtils.createAccessToken 中的默认过期时间保持一致
      isRevoked: false, // 新令牌初始状态为未撤销 (isRevoked 字段名已在 Prisma schema 中修正)
      // refreshTokenId: storedRefreshToken.id, // 可选: 关联到生成此访问令牌的刷新令牌 (如果不是轮换)
    },
  });

  // --- 步骤 7: 实现刷新令牌轮换 (Refresh Token Rotation) ---
  // 7a. 生成一个新的刷新令牌
  const newRefreshTokenValue = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope, // 新的刷新令牌也应携带最终授予的范围
    // exp: '30d' // JWTUtils.createRefreshToken 中有默认过期时间
  });
  const newRefreshTokenHash = JWTUtils.getTokenHash(newRefreshTokenValue);

  // 7b. 将旧的 (当前使用的) 刷新令牌标记为已撤销
  // 这是轮换机制的关键，防止旧令牌被再次使用。
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: {
      isRevoked: true,                          // 标记为已撤销
      revokedAt: new Date(),                    // 记录撤销时间
      replacedByTokenId: newRefreshTokenHash,   // (可选) 记录替换此令牌的新令牌的哈希，用于追踪和潜在的泄露检测
    },
  });

  // 7c. 在数据库中存储新的刷新令牌记录
  await prisma.refreshToken.create({
    data: {
      token: newRefreshTokenValue, // 考虑是否仅存储哈希值
      tokenHash: newRefreshTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addDays(new Date(), 30), // 与 JWTUtils.createRefreshToken 中的默认过期时间保持一致
      isRevoked: false,                  // 新令牌初始为未撤销
      previousTokenId: storedRefreshToken.id, // (可选但推荐) 链接到被它替换的旧刷新令牌的ID，用于泄露检测和令牌家族的追踪
    },
  });

  // --- 步骤 8: 记录成功的审计事件 ---
  await AuthorizationUtils.logAuditEvent({
    clientId: client.id,
    userId: storedRefreshToken.userId ?? undefined,
    action: 'token_refreshed_successfully_logic',
    resource: 'oauth/token_logic_refresh',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'refresh_token',
      scope: finalGrantedScope,
      newAccessTokenHash_prefix: newAccessTokenHash.substring(0, 10), // 记录部分哈希用于识别
      newRefreshTokenHash_prefix: newRefreshTokenHash.substring(0, 10),
      oldRefreshTokenId: storedRefreshToken.id,
    },
  });

  // --- 步骤 9: 返回新的令牌给客户端 ---
  return {
    accessToken: newAccessToken,
    tokenType: 'Bearer',         // 标准令牌类型
    expiresIn: 3600,             // 新访问令牌的有效期 (秒)，例如1小时
    newRefreshToken: newRefreshTokenValue, // (关键) 返回新的刷新令牌给客户端
    scope: finalGrantedScope,    // 最终授予的范围
  };
}
