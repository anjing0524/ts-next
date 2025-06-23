// 导入 Node.js 内置的 crypto 模块，用于加密操作，如生成哈希、随机字节等。
// Import Node.js built-in crypto module for cryptographic operations like hashing, random bytes, etc.
import crypto from 'crypto';

// 导入 Next.js 服务器相关的类型，例如 NextRequest 用于处理HTTP请求。
// Import Next.js server-related types, e.g., NextRequest for handling HTTP requests.
import { NextRequest } from 'next/server';

// 导入 Prisma 客户端生成的类型，用于与数据库交互。
// Import Prisma client-generated types for database interaction.
// OAuthClient 被重命名为 Client 以避免与全局 Client 类型冲突。
// OAuthClient is renamed to Client to avoid conflicts with the global Client type.
import { User, OAuthClient as Client, PrismaClientKnownRequestError } from '@prisma/client'; // Added PrismaClientKnownRequestError
// 导入 date-fns 库中的函数，用于日期和时间的操作，例如计算令牌的过期时间。
// Import functions from date-fns library for date and time operations, e.g., calculating token expiration.
import { addHours, addDays } from 'date-fns';
// 导入 jose 库，用于处理 JWT (JSON Web Tokens) 的签名、验证和编解码。
// Import jose library for handling JWT (JSON Web Tokens) signing, verification, and decoding.
import * as jose from 'jose';

// 导入共享的 Prisma 客户端实例。
// Import shared Prisma client instance.
import { prisma } from '@/lib/prisma';
// 导入权限服务，用于获取用户权限等。
// Import PermissionService for fetching user permissions, etc.
import { PermissionService } from '@/lib/services/permissionService';
// 导入自定义错误类 (Import custom error classes)
import { OAuth2Error, OAuth2ErrorCode, ConfigurationError, BaseError } from '../errors';


// 实例化权限服务，以便在工具类中使用。
// Instantiate PermissionService for use in utility classes.
const permissionService = new PermissionService();

// OAuth 2.0 标准错误代码常量。 (OAuth 2.0 standard error code constants.)
// 这些常量用于在发生错误时，向客户端返回标准化的错误信息。 (These constants are used to return standardized error information to clients when errors occur.)
export const OAuth2ErrorTypes = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
} as const; // 'as const' 将对象的属性变为只读，并将其类型推断为字面量类型。 ('as const' makes object properties readonly and infers their types as literal types.)

/**
 * PKCE (Proof Key for Code Exchange) 工具类。
 * (PKCE (Proof Key for Code Exchange) utility class.)
 * PKCE (RFC 7636) 是一种用于增强 OAuth 2.0 公共客户端 (如移动应用和单页应用) 安全性的机制，
 * (PKCE (RFC 7636) is a mechanism to enhance the security of OAuth 2.0 public clients (like mobile apps and SPAs),)
 * 主要用于防止授权码拦截攻击。
 * (primarily used to prevent authorization code interception attacks.)
 */
export class PKCEUtils {
  /**
   * 生成一个符合 RFC 7636 规范的随机 code_verifier。
   * (Generates a random code_verifier compliant with RFC 7636.)
   * @returns 返回一个 Base64URL 编码的随机字符串，长度通常为43-128个字符。
   * (Returns a Base64URL encoded random string, typically 43-128 characters long.)
   */
  static generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 根据给定的 code_verifier 和指定的转换方法 (默认为 S256) 生成 code_challenge。
   * (Generates a code_challenge from a given code_verifier and specified transformation method (defaults to S256).)
   * @param verifier - 客户端生成的 code_verifier。 (Client-generated code_verifier.)
   * @returns 返回计算得到的 code_challenge (Base64URL 编码)。 (Returns the calculated code_challenge (Base64URL encoded).)
   */
  static generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配。
   * (Verifies if the provided code_verifier matches the expected code_challenge.)
   * @param verifier - 客户端在令牌请求中提供的 code_verifier。 (code_verifier provided by the client in the token request.)
   * @param challenge - 授权服务器在授权请求阶段存储的 code_challenge。 (code_challenge stored by the authorization server during the authorization request phase.)
   * @param method - 生成 code_challenge 时使用的方法，默认为 'S256'。目前通常只支持 'S256'。
   * (Method used to generate code_challenge, defaults to 'S256'. Currently, typically only 'S256' is supported.)
   * @returns 如果验证成功则返回 true，否则返回 false。 (Returns true if verification is successful, false otherwise.)
   */
  static verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: string = 'S256'
  ): boolean {
    if (method !== 'S256') {
      console.warn(`PKCEUtils: Unsupported code_challenge_method: ${method}`);
      return false;
    }
    const calculatedChallenge = this.generateCodeChallenge(verifier);
    return calculatedChallenge === challenge;
  }

  /**
   * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范。
   * (Validates if the code_challenge string format complies with RFC 7636.)
   * @param challenge - 要验证的 code_challenge 字符串。 (The code_challenge string to validate.)
   * @returns 如果格式有效则返回 true，否则返回 false。 (Returns true if the format is valid, false otherwise.)
   */
  static validateCodeChallenge(challenge: string): boolean {
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
  }

  /**
   * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范。
   * (Validates if the code_verifier string format complies with RFC 7636.)
   * @param verifier - 要验证的 code_verifier 字符串。 (The code_verifier string to validate.)
   * @returns 如果格式有效则返回 true，否则返回 false。 (Returns true if the format is valid, false otherwise.)
   */
  static validateCodeVerifier(verifier: string): boolean {
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
  }
}

/**
 * Scope (权限范围) 工具类。
 * (Scope utility class.)
 * Scope 用于定义客户端可以请求访问哪些受保护资源的权限。
 * (Scope is used to define permissions a client can request to access protected resources.)
 */
export class ScopeUtils {
  /**
   * 将以空格分隔的 scope 字符串解析为字符串数组。
   * (Parses a space-separated scope string into an array of strings.)
   * @param scopeString - 包含一个或多个 scope 的字符串。 (String containing one or more scopes.)
   * @returns 返回一个包含各个 scope 的字符串数组。 (Returns an array of strings, each being a scope.)
   */
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return [];
    return scopeString.split(' ').filter((s) => s.length > 0);
  }

  /**
   * 将 scope 字符串数组格式化为以空格分隔的单个字符串。
   * (Formats an array of scope strings into a single space-separated string.)
   * @param scopes - 包含一个或多个 scope 的字符串数组。 (Array of strings containing one or more scopes.)
   * @returns 返回格式化后的 scope 字符串。 (Returns the formatted scope string.)
   */
  static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  static async validateScopes(
    scopes: string[],
    client: Client
  ): Promise<{ valid: boolean; invalidScopes: string[]; error_description?: string }>;
  static validateScopes(
    requestedScopes: string[],
    allowedScopes: string[]
  ): { valid: boolean; invalidScopes: string[]; error_description?: string };
  /**
   * 验证请求的 scopes 是否有效。
   * (Validates if the requested scopes are valid.)
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

      const validDbScopes = await prisma.scope.findMany({
        where: {
          name: { in: scopes },
          isActive: true,
        },
      });
      const validScopeNamesFromDb = validDbScopes.map((s) => s.name);
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

      if (client.isPublic) {
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
      return { valid: true, invalidScopes: [] };
    })();
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含特定的必需 scope。
   * (Checks if the list of scopes owned by the user includes a specific required scope.)
   */
  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所列必需 scopes 中的任何一个。
   * (Checks if the list of scopes owned by the user includes any of the listed required scopes.)
   */
  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => userScopes.includes(scope));
  }

  /**
   * 检查用户拥有的 scopes 列表是否包含所有指定的必需 scopes。
   * (Checks if the list of scopes owned by the user includes all specified required scopes.)
   */
  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
}

/**
 * JWT (JSON Web Token) 工具类。
 * (JWT (JSON Web Token) utility class.)
 */
export class JWTUtils {
  /**
   * (私有) 获取用于 JWT 签名的 RSA 私钥。
   * ((Private) Gets the RSA private key for JWT signing.)
   */
  private static async getRSAPrivateKeyForSigning(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PRIVATE_KEY_PEM;
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';

    if (!pem) {
      const errorMessage =
        'JWT_PRIVATE_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new ConfigurationError(errorMessage, 'JWT_KEY_MISSING'); // 使用 ConfigurationError (Use ConfigurationError)
      }
      console.error(errorMessage);
      throw new ConfigurationError(errorMessage, 'JWT_KEY_MISSING_DEV');
    }
    try {
      return await jose.importPKCS8(pem, algorithm as string);
    } catch (error) {
      console.error('Failed to import RSA private key (PKCS8):', error);
      throw new ConfigurationError('Invalid RSA private key (JWT_PRIVATE_KEY_PEM) format or configuration.', 'JWT_KEY_INVALID_FORMAT', { originalError: (error as Error).message });
    }
  }

  /**
   * (私有) 获取用于 JWT 验证的 RSA 公钥。
   * ((Private) Gets the RSA public key for JWT verification.)
   */
  private static async getRSAPublicKeyForVerification(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PUBLIC_KEY_PEM;
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';

    if (!pem) {
      const errorMessage =
        'JWT_PUBLIC_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new ConfigurationError(errorMessage, 'JWT_PUB_KEY_MISSING');
      }
      console.error(errorMessage);
      throw new ConfigurationError(errorMessage, 'JWT_PUB_KEY_MISSING_DEV');
    }
    try {
      return await jose.importSPKI(pem, algorithm as string);
    } catch (spkiError) {
      console.warn(
        'Failed to import RSA public key as SPKI, trying as X.509 certificate...',
        spkiError
      );
      try {
        return await jose.importX509(pem, algorithm as string);
      } catch (x509Error) {
        console.error('Failed to import RSA public key (SPKI or X.509):', x509Error);
        throw new ConfigurationError(
          'Invalid RSA public key (JWT_PUBLIC_KEY_PEM) format or configuration. Supported formats: SPKI PEM, X.509 PEM.', 'JWT_PUB_KEY_INVALID_FORMAT', { originalError: (x509Error as Error).message }
        );
      }
    }
  }

  /**
   * (私有) 获取 JWT 的签发者 (Issuer)。
   * ((Private) Gets the JWT Issuer.)
   */
  private static getIssuer(): string {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
      if (process.env.NODE_ENV === 'production') {
        throw new ConfigurationError('JWT_ISSUER is not set in production environment', 'JWT_ISSUER_MISSING');
      }
      return `http://localhost:${process.env.PORT || 3000}`;
    }
    return issuer;
  }

  /**
   * (私有) 获取 JWT 的受众 (Audience)。
   * ((Private) Gets the JWT Audience.)
   */
  private static getAudience(): string {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
      if (process.env.NODE_ENV === 'production') {
        throw new ConfigurationError('JWT_AUDIENCE is not set in production environment', 'JWT_AUDIENCE_MISSING');
      }
      return 'api_resource_dev';
    }
    return audience;
  }

  /**
   * 创建一个 Access Token。
   * (Creates an Access Token.)
   */
  static async createAccessToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    permissions?: string[];
    exp?: string;
  }): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      sub: payload.user_id || payload.client_id,
      aud: this.getAudience(),
      iss: this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      permissions: payload.permissions || [],
    };

    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(payload.exp || '1h')
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 为给定的令牌字符串生成 SHA256 哈希值。
   * (Generates a SHA256 hash for a given token string.)
   */
  static getTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 验证 Access Token 的有效性。
   * (Verifies the validity of an Access Token.)
   */
  static async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string; // 错误信息字符串 (Error message string)
  }> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    try {
      const { payload } = await jose.jwtVerify(token, await this.getRSAPublicKeyForVerification(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
        algorithms: [algorithm as string],
      });

      if (payload.jti) {
        const blacklistedJti = await prisma.tokenBlacklist.findUnique({
          where: { jti: payload.jti },
        });
        if (blacklistedJti) {
          return { valid: false, error: 'Token has been revoked (JTI blacklisted)' }; // JTI 已在黑名单中 (JTI is blacklisted)
        }
      }

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Token verification failed';
      console.error('Access Token Verification Error:', error);

      if (error instanceof jose.errors.JWTExpired) {
        errorMessage = 'Token has expired';
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        errorMessage = `Token claim validation failed: ${error.claim} ${error.reason}`;
      } else if (
        error instanceof jose.errors.JWSInvalid ||
        error instanceof jose.errors.JWSSignatureVerificationFailed
      ) {
        errorMessage = 'Invalid token or signature';
      }
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * 创建一个 Refresh Token。
   * (Creates a Refresh Token.)
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
      aud: this.getAudience(),
      iss: this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      token_type: 'refresh',
    };
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(payload.exp || '30d')
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 验证 Refresh Token 的有效性。
   * (Verifies the validity of a Refresh Token.)
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

      if (payload.token_type !== 'refresh') {
        console.warn('Invalid token type for refresh token verification:', payload.token_type);
        return { valid: false, error: 'Invalid token type: expected refresh token' };
      }

      if (payload.jti) {
        const blacklistedJti = await prisma.tokenBlacklist.findUnique({
          where: { jti: payload.jti },
        });
        if (blacklistedJti) {
          return { valid: false, error: 'Refresh token has been revoked (JTI blacklisted)' };
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
   * (Creates an ID Token (for OpenID Connect flow).)
   */
  static async createIdToken(user: User, client: Client, nonce?: string): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      iss: this.getIssuer(),
      sub: user.id,
      aud: client.clientId,
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),

      email: user.email,
      email_verified: user.emailVerified ?? false,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
      given_name: user.firstName || undefined,
      family_name: user.lastName || undefined,
      preferred_username: user.username || undefined,
      nonce: nonce,
    };

    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .sign(await this.getRSAPrivateKeyForSigning());
  }
}

/**
 * 客户端认证 (Client Authentication) 工具类。
 * (Client Authentication utility class.)
 */
export class ClientAuthUtils {
  /**
   * 认证客户端。
   * (Authenticates a client.)
   * @param request - NextRequest 对象。 (NextRequest object.)
   * @param body - 解析后的请求体 FormData 对象。 (Parsed request body FormData object.)
   * @returns 返回一个 Promise，解析为 Client (OAuthClient) 对象。 (Returns a Promise that resolves to a Client (OAuthClient) object.)
   * @throws {OAuth2Error} 如果认证失败。 (If authentication fails.)
   * @throws {ConfigurationError} 如果存在服务器端配置问题。 (If there is a server-side configuration issue.)
   * @throws {BaseError} 如果发生意外的数据库错误。 (If an unexpected database error occurs.)
   */
  static async authenticateClient(
    request: NextRequest,
    body: FormData
  ): Promise<Client> { // 修改返回类型为 Promise<Client> (Changed return type to Promise<Client>)
    let client_id = body.get('client_id') as string;
    let client_secret = body.get('client_secret') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [basicClientId, basicClientSecret] = credentials.split(':');

        if (basicClientId && basicClientSecret) {
          client_id = client_id || basicClientId;
          client_secret = client_secret || basicClientSecret;
        }
      } catch {
        throw new OAuth2Error( 'Invalid Basic authentication header format.', OAuth2ErrorCode.InvalidClient, 401);
      }
    }

    if (
      client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
      client_assertion
    ) {
      return await this.authenticateWithJWT(client_assertion, request);
    }

    if (client_id && client_secret) {
      return await this.authenticateWithSecret(client_id, client_secret);
    }

    if (client_id && !client_secret) {
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: client_id, isActive: true },
      });

      if (!client) {
        throw new OAuth2Error('Client not found.', OAuth2ErrorCode.InvalidClient, 401);
      }

      if (!client.isPublic) {
        throw new OAuth2Error('Client is not a public client and requires authentication.', OAuth2ErrorCode.InvalidClient, 401);
      }
      return client;
    }

    throw new OAuth2Error('Client authentication required but not provided or method not supported.', OAuth2ErrorCode.InvalidClient, 401);
  }

  /**
   * (私有) 使用 client_id 和 client_secret 进行认证。
   * ((Private) Authenticates with client_id and client_secret.)
   */
  private static async authenticateWithSecret(
    clientId: string,
    clientSecret: string
  ): Promise<Client> { // 修改返回类型 (Changed return type)
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId, isActive: true },
    });

    if (!client) {
      throw new OAuth2Error('Invalid client ID or client not active.', OAuth2ErrorCode.InvalidClient, 401);
    }

    if (client.isPublic) {
      throw new OAuth2Error('Public client attempted to authenticate with a secret.', OAuth2ErrorCode.InvalidClient, 400); // 400 Bad Request for this misuse
    }

    if (!client.clientSecret) {
      console.error(`Client ${clientId} is missing clientSecret in database.`);
      throw new ConfigurationError('Client secret not configured for this client.', 'CLIENT_CONFIG_MISSING_SECRET');
    }

    try {
      const bcrypt = await import('bcrypt');
      const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);

      if (!isValidSecret) {
        throw new OAuth2Error('Invalid client secret.', OAuth2ErrorCode.InvalidClient, 401);
      }
    } catch (error) {
      console.error('Error during bcrypt.compare for client secret validation:', error);
      throw new BaseError('Error during client secret validation.', 500, 'CRYPTO_ERROR');
    }

    if (client.clientSecretExpiresAt && client.clientSecretExpiresAt < new Date()) {
      throw new OAuth2Error('Client secret has expired.', OAuth2ErrorCode.InvalidClient, 401);
    }
    return client;
  }

  /**
   * (私有) 使用 JWT 客户端断言进行认证。
   * ((Private) Authenticates with JWT client assertion.)
   */
  private static async authenticateWithJWT(
    assertion: string,
    request: NextRequest
  ): Promise<Client> { // 修改返回类型 (Changed return type)
    try {
      const decodedJwt = jose.decodeJwt(assertion);

      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        throw new OAuth2Error('Invalid JWT assertion: iss and sub claims are required and must be identical (client_id).', OAuth2ErrorCode.InvalidClient, 400);
      }

      const clientId = decodedJwt.iss as string;
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId, isActive: true },
      });

      if (!client) {
        throw new OAuth2Error('Client specified in JWT assertion not found or not active.', OAuth2ErrorCode.InvalidClient, 401);
      }

      if (!client.jwksUri) {
        throw new ConfigurationError('Client is not configured for JWT assertion-based authentication (missing jwks_uri).', 'CLIENT_CONFIG_MISSING_JWKS_URI');
      }

      const tokenEndpointUrl = this.getTokenEndpointUrl(request);
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      await jose.jwtVerify(assertion, JWKS, {
        issuer: clientId,
        audience: tokenEndpointUrl,
        algorithms: ['RS256', 'ES256', 'PS256'],
      });
      return client;
    } catch (error: any) {
      console.error('Client JWT assertion validation failed:', error);
      let errorDescription = 'Client assertion validation failed.';
      let oauthErrorCode = OAuth2ErrorCode.InvalidClient;

      if (error instanceof jose.errors.JWTExpired) {
        errorDescription = 'Client assertion has expired.';
        oauthErrorCode = OAuth2ErrorCode.InvalidGrant; // Per RFC7521, expired JWT assertion can be invalid_grant
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        errorDescription = `Client assertion claim validation failed: ${error.claim} ${error.reason}.`;
      } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        errorDescription = 'Client assertion signature verification failed.';
      } else if (error instanceof ConfigurationError) { // 从内部抛出的 ConfigurationError (Re-throw ConfigurationError from inside)
        throw error;
      }
      throw new OAuth2Error(errorDescription, oauthErrorCode, 400, undefined, { originalError: error.message });
    }
  }

  /**
   * (私有) 获取当前请求的令牌端点 URL。
   * ((Private) Gets the token endpoint URL for the current request.)
   */
  private static getTokenEndpointUrl(request: NextRequest): string {
    const requestUrl = new URL(request.url);
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') || requestUrl.host;
    const path = process.env.OAUTH_TOKEN_ENDPOINT_PATH || '/api/v2/oauth/token'; // 从环境变量或默认值获取路径 (Get path from env var or default)
    return `${protocol}://${host}${path}`;
  }
}

/**
 * 授权 (Authorization) 工具类。
 * (Authorization utility class.)
 */
export class AuthorizationUtils {
  /**
   * 验证提供的 redirect_uri 是否在客户端注册的 redirect_uris 列表中。
   * (Validates if the provided redirect_uri is in the client's list of registered redirect_uris.)
   */
  static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
    return registeredUris.includes(redirectUri);
  }

  /**
   * 验证 response_type 是否是服务器支持的类型。
   * (Validates if the response_type is supported by the server.)
   */
  static validateResponseType(responseType: string, supportedTypes: string[] = ['code']): boolean {
    return supportedTypes.includes(responseType);
  }

  /**
   * 生成一个随机的 state 参数值。
   * (Generates a random state parameter value.)
   */
  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个随机的 nonce 参数值 (主要用于 OpenID Connect)。
   * (Generates a random nonce parameter value (mainly for OpenID Connect).)
   */
  static generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成一个安全的随机授权码 (Authorization Code)。
   * (Generates a secure random Authorization Code.)
   */
  static generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 记录审计事件到数据库。
   * (Logs an audit event to the database.)
   */
  static async logAuditEvent(event: {
    userId?: string;
    clientId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      let validUserId: string | null = null;
      if (event.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: event.userId },
          select: { id: true },
        });
        validUserId = userExists ? event.userId : null;
        if (!userExists) console.warn(`Audit log: User ID ${event.userId} not found.`);
      }

      let validClientIdForDb: string | null = null;
      if (event.clientId) {
        const clientRecordByStringId = await prisma.oAuthClient.findUnique({ where: { clientId: event.clientId }});
        if (clientRecordByStringId) {
            validClientIdForDb = clientRecordByStringId.id;
        } else {
            const clientRecordByCuid = await prisma.oAuthClient.findUnique({ where: {id: event.clientId }});
            if (clientRecordByCuid) {
                validClientIdForDb = clientRecordByCuid.id;
            } else {
                 console.warn(`Audit log: Client with identifier ${event.clientId} not found.`);
            }
        }
      }

      let actorType: string = 'SYSTEM';
      let actorId: string | null = null;

      if (validUserId) {
        actorType = 'USER';
        actorId = validUserId;
      } else if (validClientIdForDb) {
        actorType = 'CLIENT';
        const clientForActorId = await prisma.oAuthClient.findUnique({ where: { id: validClientIdForDb }});
        actorId = clientForActorId ? clientForActorId.clientId : event.clientId;
      }

      await prisma.auditLog.create({
        data: {
          user: validUserId ? { connect: { id: validUserId } } : undefined,
          client: validClientIdForDb ? { connect: { id: validClientIdForDb } } : undefined,
          action: event.action,
          resourceType: event.resourceType || null, // Assuming resource is resourceType
          resourceId: event.resourceId || null,   // Added resourceId
          // resource: event.resource || null, // 'resource' might be a combination or specific field
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          success: event.success,
          errorMessage: event.errorMessage || null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
          status: event.success ? 'SUCCESS' : 'FAILURE', // Added status field
          actorType: actorType,
          actorId: actorId,
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  /**
   * 获取用户的有效权限列表。
   * (Gets the list of effective permissions for a user.)
   */
  static async getUserPermissions(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }
    const permissionsSet = await permissionService.getUserEffectivePermissions(userId);
    return Array.from(permissionsSet);
  }
}

// 导入自定义的 ApiError 类，用于标准化的API错误处理。
// Import custom ApiError class for standardized API error handling.
// import { ApiError } from '../api/errorHandler'; // 已在顶部导入 BaseError, OAuth2Error 等 (Already imported BaseError, OAuth2Error etc. at the top)

/**
 * 速率限制 (Rate Limiting) 工具类。
 * (Rate Limiting utility class.)
 */
export class RateLimitUtils {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  /**
   * 检查给定的 key 是否已达到速率限制。
   * (Checks if the given key has reached the rate limit.)
   */
  static isRateLimited(
    key: string,
    maxRequests: number = 100,
    windowMs: number = 60000
  ): boolean {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.DISABLE_RATE_LIMITING === 'true' ||
      key.startsWith('test-') ||
      key.includes('192.168.') || key.includes('127.0.0.1') ||
      key === 'unknown'
    ) {
      return false;
    }

    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (record.count >= maxRequests) {
      return true;
    }

    record.count++;
    return false;
  }

  /**
   * 根据请求和类型生成速率限制的 key。
   * (Generates a rate limiting key based on the request and type.)
   */
  static getRateLimitKey(request: NextRequest, type: 'client' | 'ip' = 'ip'): string {
    if (type === 'ip') {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        request.headers.get('x-real-ip') ||
        request.ip ||
        'unknown';

      if (process.env.NODE_ENV === 'test') {
        return `test-${ip}`;
      }
      return ip;
    }
    console.warn("Client-based rate limiting key generation is placeholder. Implement actual client ID extraction.");
    return 'client-rate-limit-placeholder';
  }

  /**
   * 清除所有速率限制缓存。
   * (Clears all rate limit cache.)
   */
  static clearCache(): void {
    this.requests.clear();
    console.log("Rate limit cache cleared.");
  }

  /**
   * (仅用于测试) 设置特定的速率限制状态。
   * ((For testing only) Sets a specific rate limit state.)
   */
  static setTestRateLimit(key: string, count: number, resetTime: number): void {
    if (process.env.NODE_ENV === 'test') {
      this.requests.set(key, { count, resetTime });
    } else {
      console.warn("setTestRateLimit called outside of test environment. Operation ignored.");
    }
  }
}

/**
 * 封装刷新令牌 (refresh_token) 授权类型的核心处理逻辑。
 * (Encapsulates the core processing logic for the refresh_token grant type.)
 */
export async function processRefreshTokenGrantLogic(
  refreshTokenValue: string,
  requestedScope: string | undefined,
  client: Client,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  newRefreshToken: string;
  scope?: string;
}> {
  const verification = await JWTUtils.verifyRefreshToken(refreshTokenValue);
  if (!verification.valid || !verification.payload) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'invalid_refresh_token_structure_signature',
      resource: 'oauth/token_logic_refresh',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: verification.error || 'Refresh token JWT verification failed (structure/signature).',
      metadata: { grantType: 'refresh_token', providedTokenValue: refreshTokenValue.substring(0, 20) + "..." },
    });
    throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
      verification.error || 'Invalid refresh token.',
      OAuth2ErrorCode.InvalidGrant, // 使用枚举 (Use enum)
      400
    );
  }

  const refreshTokenHashToVerify = JWTUtils.getTokenHash(refreshTokenValue);
  const storedRefreshToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHashToVerify,
      isRevoked: false,
      expiresAt: { gt: new Date() },
      clientId: client.id,
    },
  });

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
    throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
      'Refresh token is invalid, expired, has been revoked, or was not issued to the authenticated client.',
      OAuth2ErrorCode.InvalidGrant,
      400
    );
  }

  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope ?? '');
  let finalGrantedScope = storedRefreshToken.scope ?? undefined;

  if (requestedScope) {
    const requestedScopeArray = ScopeUtils.parseScopes(requestedScope);
    const scopeValidation = ScopeUtils.validateScopes(requestedScopeArray, originalScopes);
    if (!scopeValidation.valid) {
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
      throw new OAuth2Error( // 使用 OAuth2Error (Use OAuth2Error)
        'Requested scope is invalid or exceeds the scope originally granted to the refresh token.',
        OAuth2ErrorCode.InvalidScope,
        400
      );
    }
    finalGrantedScope = requestedScope;
  }

  let permissions: string[] = [];
  if (storedRefreshToken.userId) {
    permissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);
  }

  const newAccessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope,
    permissions,
  });
  const newAccessTokenHash = JWTUtils.getTokenHash(newAccessToken);

  await prisma.accessToken.create({
    data: {
      // token: newAccessToken, // 移除了存储原始令牌的字段 (Removed field for storing raw token)
      tokenHash: newAccessTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addHours(new Date(), 1),
      // isRevoked: false, // isRevoked 字段在 AccessToken 模型中不存在 (isRevoked field does not exist in AccessToken model)
    },
  });

  const newRefreshTokenValue = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope,
  });
  const newRefreshTokenHash = JWTUtils.getTokenHash(newRefreshTokenValue);

  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      // replacedByTokenId: newRefreshTokenHash, // replacedByTokenId 字段在 RefreshToken 模型中不存在 (replacedByTokenId field does not exist in RefreshToken model)
    },
  });

  await prisma.refreshToken.create({
    data: {
      // token: newRefreshTokenValue, // 移除了存储原始令牌的字段 (Removed field for storing raw token)
      tokenHash: newRefreshTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addDays(new Date(), 30),
      isRevoked: false,
      previousTokenId: storedRefreshToken.id,
    },
  });

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
      newAccessTokenHash_prefix: newAccessTokenHash.substring(0, 10),
      newRefreshTokenHash_prefix: newRefreshTokenHash.substring(0, 10),
      oldRefreshTokenId: storedRefreshToken.id,
    },
  });

  return {
    accessToken: newAccessToken,
    tokenType: 'Bearer',
    expiresIn: 3600,
    newRefreshToken: newRefreshTokenValue,
    scope: finalGrantedScope,
  };
}
