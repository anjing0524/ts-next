import crypto from 'crypto';

import { NextRequest } from 'next/server';

import { User, Client, Scope } from '@prisma/client';
import { Client as OAuthClientPrismaType } from '@prisma/client'; // Added this import
import { addHours, addDays } from 'date-fns'; // For token expiry
import * as jose from 'jose';

import { prisma } from '@/lib/prisma';
import { PermissionService } from '@/lib/services/permissionService'; // Import new service

// Instantiate the service
const permissionService = new PermissionService();

// OAuth 2.0 Error Types
export interface OAuth2Error {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

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
} as const;

// PKCE utilities
export class PKCEUtils {
  static generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  static verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: string = 'S256'
  ): boolean {
    if (method !== 'S256') {
      return false;
    }
    const calculatedChallenge = this.generateCodeChallenge(verifier);
    return calculatedChallenge === challenge;
  }

  static validateCodeChallenge(challenge: string): boolean {
    // RFC 7636: code_challenge must be 43-128 characters
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
  }

  static validateCodeVerifier(verifier: string): boolean {
    // RFC 7636: code_verifier must be 43-128 characters
    return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
  }
}

// Scope utilities
export class ScopeUtils {
  static parseScopes(scopeString?: string): string[] {
    if (!scopeString) return [];
    return scopeString.split(' ').filter((s) => s.length > 0);
  }

  static formatScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  static async validateScopes(
    scopes: string[],
    client: Client
  ): Promise<{ valid: boolean; invalidScopes: string[] }>;
  static validateScopes(
    requestedScopes: string[],
    allowedScopes: string[]
  ): { valid: boolean; invalidScopes: string[] };
  static validateScopes(
    scopes: string[],
    clientOrAllowedScopes: Client | string[]
  ):
    | Promise<{ valid: boolean; invalidScopes: string[] }>
    | { valid: boolean; invalidScopes: string[] } {
    if (scopes.length === 0) {
      return { valid: true, invalidScopes: [] };
    }

    // If second parameter is a string array, it's the simple validation (used by client_credentials)
    if (Array.isArray(clientOrAllowedScopes)) {
      const invalidScopes = scopes.filter((scope) => !clientOrAllowedScopes.includes(scope));
      return {
        valid: invalidScopes.length === 0,
        invalidScopes,
      };
    }

    // Otherwise, it's a Client object and we need async validation (used by /authorize)
    const client = clientOrAllowedScopes as Client; // Type assertion

    // Return a Promise for the async case
    return (async () => {
      // Step 1: Check against client.allowedScopes
      let clientAllowedScopes: string[] = [];
      if (client.allowedScopes) {
        try {
          clientAllowedScopes = JSON.parse(client.allowedScopes as string);
          if (!Array.isArray(clientAllowedScopes)) clientAllowedScopes = [];
        } catch (e) {
          console.error('Failed to parse client.allowedScopes for client ID:', client.id, e);
          // If allowedScopes is malformed, treat as if no scopes are allowed for safety.
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

      // Step 2: Check if scopes exist globally and are active in the Scope table
      const validDbScopes = await prisma.scope.findMany({
        where: {
          name: { in: scopes }, // Only check scopes that were already allowed for the client
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

      // Step 3: For public clients, ensure all requested (and now validated) scopes are also public
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

  static hasScope(userScopes: string[], requiredScope: string): boolean {
    return userScopes.includes(requiredScope);
  }

  static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => userScopes.includes(scope));
  }

  static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((scope) => userScopes.includes(scope));
  }
}

// JWT utilities
export class JWTUtils {
  // HS256用的密钥获取方法 (Key retrieval method for HS256)
  // private static getSecret(): Uint8Array {
  //   const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
  //   if (!secret) {
  //     if (process.env.NODE_ENV === 'production') {
  //       throw new Error('JWT_ACCESS_TOKEN_SECRET is not set in production environment');
  //     }
  //     // Default secret for development
  //     return new TextEncoder().encode('super-secret-key-for-hs256-oauth-dev-env-32-chars-for-dev-only');
  //   }
  //   return new TextEncoder().encode(secret);
  // }

  // 内部方法，用于获取RSA私钥进行签名 (Internal method to get RSA private key for signing)
  private static async getRSAPrivateKeyForSigning(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PRIVATE_KEY_PEM; // Changed variable name
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // Read algorithm

    if (!pem) {
      const errorMessage =
        'JWT_PRIVATE_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new Error(errorMessage);
      }
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    try {
      return await jose.importPKCS8(pem, algorithm as string); // Use algorithm
    } catch (error) {
      console.error('Failed to import RSA private key (PKCS8):', error);
      throw new Error('Invalid RSA private key (JWT_PRIVATE_KEY_PEM) format or configuration.');
    }
  }

  // 内部方法，用于获取RSA公钥进行验证 (Internal method to get RSA public key for verification)
  // 注意: 资源服务器通常通过JWKS端点获取公钥 (Note: Resource servers usually get public key via JWKS endpoint)
  private static async getRSAPublicKeyForVerification(): Promise<jose.KeyLike> {
    const pem = process.env.JWT_PUBLIC_KEY_PEM; // Changed variable name
    const algorithm = process.env.JWT_ALGORITHM || 'RS256'; // Read algorithm

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
      // 尝试以SPKI格式导入，这是常见的公钥PEM格式
      return await jose.importSPKI(pem, algorithm as string); // Use algorithm
    } catch (spkiError) {
      console.warn(
        'Failed to import RSA public key as SPKI, trying as X.509 certificate...',
        spkiError
      );
      try {
        // 如果SPKI失败，尝试作为X.509证书导入
        return await jose.importX509(pem, algorithm as string); // Use algorithm
      } catch (x509Error) {
        console.error('Failed to import RSA public key (SPKI or X.509):', x509Error);
        throw new Error(
          'Invalid RSA public key (JWT_PUBLIC_KEY_PEM) format or configuration. Supported formats: SPKI PEM, X.509 PEM.'
        );
      }
    }
  }

  private static getIssuer(): string {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_ISSUER is not set in production environment');
      }
      return `http://localhost:${process.env.PORT || 3000}`;
    }
    return issuer;
  }

  private static getAudience(): string {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_AUDIENCE is not set in production environment');
      }
      return 'api_resource_dev';
    }
    return audience;
  }

  static async createAccessToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string;
    permissions?: string[]; // 权限列表 (Permissions list)
    // username?: string; // 可选：用户名 (Optional: username)
    // roles?: string[]; // 可选：用户角色 (Optional: user roles)
    exp?: string; // 过期时间，例如 '1h', '30d' (Expiration time, e.g., '1h', '30d')
  }): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      // 如果user_id存在，则sub为user_id，否则为client_id (If user_id exists, sub is user_id, else client_id)
      sub: payload.user_id || payload.client_id,
      aud: this.getAudience(), // 受众为API资源 (Audience is API resource)
      iss: this.getIssuer(), // 签发者 (Issuer)
      jti: crypto.randomUUID(), // JWT ID，确保唯一性 (JWT ID, ensures uniqueness)
      iat: Math.floor(Date.now() / 1000), // 签发时间 (Issued at time)
      scope: payload.scope,
      permissions: payload.permissions || [],
      // 可在此处添加 username 和 roles，如果已获取并传入
      // (username and roles can be added here if fetched and passed in)
      // username: payload.username,
      // roles: payload.roles,
    };

    // 移除 undefined 的声明，确保载荷干净 (Remove undefined claims for a clean payload)
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId }) // Use algorithm and kid
      // .setIssuedAt() // iat 已在 payload 中设置 (iat already set in payload)
      // .setIssuer(this.getIssuer()) // iss 已在 payload 中设置 (iss already set in payload)
      // .setSubject(payload.user_id || payload.client_id) // sub 已在 payload 中设置 (sub already set in payload)
      // .setAudience(this.getAudience()) // aud 已在 payload 中设置 (aud already set in payload)
      // .setJti(crypto.randomUUID()) // jti 已在 payload 中设置 (jti already set in payload)
      .setExpirationTime(payload.exp || '1h') // 设置过期时间 (Set expiration time)
      .sign(await this.getRSAPrivateKeyForSigning()); // 使用RSA私钥签名 (Sign with RSA private key)
  }

  static async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    try {
      // 使用RSA公钥验证 (Verify with RSA public key)
      const { payload } = await jose.jwtVerify(token, await this.getRSAPublicKeyForVerification(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
        algorithms: [algorithm as string], // Use algorithm
      });

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Token verification failed';
      console.error('Access Token Verification Error:', error); // 服务端日志 (Server-side log)

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

  static async createRefreshToken(payload: {
    client_id: string;
    user_id?: string;
    scope?: string; // 可选的作用域 (Optional scope)
    exp?: string; // 过期时间 (Expiration time)
  }): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      sub: payload.user_id || payload.client_id,
      aud: this.getAudience(), // 刷新令牌的受众通常也是API或特定令牌端点 (Audience for refresh token is also typically API or specific token endpoint)
      iss: this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      token_type: 'refresh', // 明确此为刷新令牌 (Clearly indicate this is a refresh token)
    };
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId }) // Use algorithm and kid
      .setExpirationTime(payload.exp || '30d') // 刷新令牌通常有更长的有效期 (Refresh tokens usually have longer validity)
      .sign(await this.getRSAPrivateKeyForSigning()); // 使用RSA私钥签名 (Sign with RSA private key)
  }

  static async verifyRefreshToken(token: string): Promise<{
    valid: boolean;
    payload?: jose.JWTPayload;
    error?: string;
  }> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    try {
      // 使用RSA公钥验证 (Verify with RSA public key)
      const { payload } = await jose.jwtVerify(token, await this.getRSAPublicKeyForVerification(), {
        issuer: this.getIssuer(),
        audience: this.getAudience(),
        algorithms: [algorithm as string], // Use algorithm
      });

      // 检查这是否确实是一个刷新令牌 (Check if this is actually a refresh token)
      if (payload.token_type !== 'refresh') {
        console.warn('Invalid token type for refresh token verification:', payload.token_type); // 服务端日志 (Server-side log)
        return { valid: false, error: 'Invalid token type: expected refresh token' };
      }

      return { valid: true, payload };
    } catch (error) {
      let errorMessage = 'Refresh token verification failed';
      console.error('Refresh Token Verification Error:', error); // 服务端日志 (Server-side log)

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

  // 创建ID令牌 (Create ID Token)
  static async createIdToken(user: User, client: Client, nonce?: string): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      iss: this.getIssuer(), // 签发者 (Issuer)
      sub: user.id, // 用户ID作为主题 (User ID as subject)
      aud: client.clientId, // 客户端ID作为受众 (Client ID as audience)
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1小时过期 (1 hour expiration)
      iat: Math.floor(Date.now() / 1000), // 签发时间 (Issued at)
      jti: crypto.randomUUID(), // JWT ID

      // OIDC 标准声明 (OIDC Standard Claims)
      email: user.email,
      email_verified: user.emailVerified ?? false, // 确保有默认值 (Ensure default value)
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined, // 避免空字符串 (Avoid empty string)
      given_name: user.firstName || undefined,
      family_name: user.lastName || undefined,
      preferred_username: user.username || undefined, // 如果用户名存在 (If username exists)

      // 如果提供了nonce，则包含它 (If nonce is provided, include it)
      nonce: nonce,
    };

    // 移除所有值为 undefined 的声明 (Remove all claims with undefined value)
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId }) // Use algorithm and kid
      .sign(await this.getRSAPrivateKeyForSigning()); // 使用RSA私钥签名 (Sign with RSA private key)
  }
}

// Client authentication utilities
export class ClientAuthUtils {
  static async authenticateClient(
    request: NextRequest,
    body: FormData
  ): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    let client_id = body.get('client_id') as string;
    let client_secret = body.get('client_secret') as string;
    const client_assertion_type = body.get('client_assertion_type') as string;
    const client_assertion = body.get('client_assertion') as string;

    // Check for HTTP Basic Authentication first
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.slice(6); // Remove 'Basic '
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [basicClientId, basicClientSecret] = credentials.split(':');

        if (basicClientId && basicClientSecret) {
          // Use Basic auth credentials, but allow form data to override if present
          client_id = client_id || basicClientId;
          client_secret = client_secret || basicClientSecret;
        }
      } catch (error) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid Basic authentication format',
          },
        };
      }
    }

    // JWT Client Authentication (private_key_jwt)
    if (
      client_assertion_type === 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' &&
      client_assertion
    ) {
      return await this.authenticateWithJWT(client_assertion, request);
    }

    // Client Secret Authentication (either from Basic auth or form data)
    if (client_id && client_secret) {
      return await this.authenticateWithSecret(client_id, client_secret);
    }

    // Public client (no authentication)
    if (client_id && !client_secret) {
      const client = await prisma.client.findUnique({
        where: { clientId: client_id, isActive: true },
      });

      if (!client) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not found',
          },
        };
      }

      if (!client.isPublic) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client authentication required',
          },
        };
      }

      return { client };
    }

    return {
      client: null,
      error: {
        error: OAuth2ErrorTypes.INVALID_CLIENT,
        error_description: 'Client authentication required',
      },
    };
  }

  private static async authenticateWithSecret(
    clientId: string,
    clientSecret: string
  ): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    const client = await prisma.client.findUnique({
      where: { clientId, isActive: true },
    });

    if (!client) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Invalid client credentials',
        },
      };
    }

    // 对于公共客户端，不应该有密钥
    if (client.isPublic) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Public client should not provide client_secret',
        },
      };
    }

    // 验证客户端密钥（使用bcrypt比较哈希值）
    if (!client.clientSecret) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client secret not configured',
        },
      };
    }

    try {
      const bcrypt = await import('bcrypt');
      const isValidSecret = await bcrypt.compare(clientSecret, client.clientSecret);

      if (!isValidSecret) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid client credentials',
          },
        };
      }
    } catch (error) {
      console.error('bcrypt comparison error:', error);
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client authentication failed',
        },
      };
    }

    // Check if client secret has expired
    if (client.clientSecretExpiresAt && client.clientSecretExpiresAt < new Date()) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client secret has expired',
        },
      };
    }

    return { client };
  }

  private static async authenticateWithJWT(
    assertion: string,
    request: NextRequest
  ): Promise<{
    client: Client | null;
    error?: OAuth2Error;
  }> {
    try {
      const decodedJwt = jose.decodeJwt(assertion);

      if (!decodedJwt.iss || !decodedJwt.sub || decodedJwt.iss !== decodedJwt.sub) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Invalid JWT: iss and sub claims are required and must match',
          },
        };
      }

      const clientId = decodedJwt.iss;
      const client = await prisma.client.findUnique({
        where: { clientId, isActive: true },
      });

      if (!client) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not found',
          },
        };
      }

      if (!client.jwksUri) {
        return {
          client: null,
          error: {
            error: OAuth2ErrorTypes.INVALID_CLIENT,
            error_description: 'Client not configured for JWT assertion',
          },
        };
      }

      // Get token endpoint URL for audience validation
      const tokenEndpointUrl = this.getTokenEndpointUrl(request);
      const JWKS = jose.createRemoteJWKSet(new URL(client.jwksUri));

      await jose.jwtVerify(assertion, JWKS, {
        issuer: clientId,
        audience: tokenEndpointUrl,
        algorithms: ['RS256', 'ES256', 'PS256'],
      });

      return { client };
    } catch (error) {
      return {
        client: null,
        error: {
          error: OAuth2ErrorTypes.INVALID_CLIENT,
          error_description: 'Client assertion validation failed',
        },
      };
    }
  }

  private static getTokenEndpointUrl(request: NextRequest): string {
    const requestUrl = new URL(request.url);
    const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') || requestUrl.host;
    return `${protocol}://${host}/api/oauth/token`;
  }
}

// Authorization utilities
export class AuthorizationUtils {
  static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean {
    return registeredUris.includes(redirectUri);
  }

  static validateResponseType(responseType: string, supportedTypes: string[] = ['code']): boolean {
    return supportedTypes.includes(responseType);
  }

  static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static async logAuditEvent(event: {
    userId?: string;
    clientId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Validate userId exists if provided
      let validUserId: string | null = null;
      if (event.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: event.userId },
          select: { id: true },
        });
        validUserId = userExists ? event.userId : null;
      }

      // Validate clientId exists if provided
      let validClientId: string | null = null;
      if (event.clientId) {
        const clientExists = await prisma.client.findUnique({
          where: { id: event.clientId },
          select: { id: true },
        });
        validClientId = clientExists ? event.clientId : null;
      }

      await prisma.auditLog.create({
        data: {
          userId: validUserId,
          clientId: validClientId,
          action: event.action,
          resource: event.resource || null,
          ipAddress: event.ipAddress || null,
          userAgent: event.userAgent || null,
          success: event.success,
          errorMessage: event.errorMessage || null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  static async getUserPermissions(userId: string): Promise<string[]> {
    if (!userId) {
      // Optional: Log a warning if userId is unexpectedly missing
      // console.warn('AuthorizationUtils.getUserPermissions called with no userId');
      return [];
    }
    // Delegate to the PermissionService
    const permissionsSet = await permissionService.getUserEffectivePermissions(userId);
    // Convert the Set<string> back to string[] to match the original method signature
    return Array.from(permissionsSet);
  }
}

import { ApiError } from '../api/errorHandler'; // Corrected import path for ApiError

// Rate limiting utilities
export class RateLimitUtils {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  static isRateLimited(
    key: string,
    maxRequests: number = 100,
    windowMs: number = 60000 // 1 minute
  ): boolean {
    // Bypass rate limiting in test environment or for test IPs
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.DISABLE_RATE_LIMITING === 'true' ||
      key.startsWith('test-') ||
      key.includes('192.168.') ||
      key.includes('127.0.0.1') ||
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

  static getRateLimitKey(request: NextRequest, type: 'client' | 'ip' = 'ip'): string {
    if (type === 'ip') {
      const ip =
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

      // Add test prefix for test requests
      if (process.env.NODE_ENV === 'test') {
        return `test-${ip}`;
      }

      return ip;
    }

    // For client-based rate limiting, you'd extract client_id from the request
    return 'client-rate-limit';
  }

  // Method to clear rate limit cache (useful for testing)
  static clearCache(): void {
    this.requests.clear();
  }

  // Method to set a custom rate limit for testing
  static setTestRateLimit(key: string, count: number, resetTime: number): void {
    if (process.env.NODE_ENV === 'test') {
      this.requests.set(key, { count, resetTime });
    }
  }
}

// Function to encapsulate refresh token grant logic
export async function processRefreshTokenGrantLogic(
  refreshTokenValue: string,
  requestedScope: string | undefined,
  client: OAuthClientPrismaType, // Use imported Prisma type
  ipAddress?: string,
  userAgent?: string
): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  newRefreshToken: string;
  scope?: string;
}> {
  // Verify refresh token structure and signature
  const verification = await JWTUtils.verifyRefreshToken(refreshTokenValue);
  if (!verification.valid || !verification.payload) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'invalid_refresh_token_structure',
      resource: 'oauth/token_logic', // Indicate this is from shared logic
      ipAddress,
      userAgent,
      success: false,
      errorMessage: verification.error || 'Refresh token verification failed (structure/signature)',
      metadata: { grantType: 'refresh_token' },
    });
    throw new ApiError(
      400,
      verification.error || 'Invalid refresh token',
      OAuth2ErrorTypes.INVALID_GRANT
    );
  }

  // Check if refresh token exists in database and is not revoked
  const refreshTokenHashVerify = crypto
    .createHash('sha256')
    .update(refreshTokenValue)
    .digest('hex');
  const storedRefreshToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHashVerify,
      revoked: false,
      expiresAt: {
        gt: new Date(),
      },
      clientId: client.id, // Ensure token belongs to the authenticated client
    },
  });

  if (!storedRefreshToken) {
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'refresh_token_not_found_or_revoked',
      resource: 'oauth/token_logic',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Refresh token not found, revoked, expired, or client mismatch',
      metadata: { grantType: 'refresh_token' },
    });
    throw new ApiError(
      400,
      'Refresh token has been revoked, is invalid, or expired',
      OAuth2ErrorTypes.INVALID_GRANT
    );
  }

  // Client validation against token's client_id (already implicitly done by DB query with clientId)
  // Redundant check, but good for clarity if query changes:
  if (storedRefreshToken.clientId !== client.id) {
    // This case should ideally not be reached if the DB query includes clientId
    await AuthorizationUtils.logAuditEvent({
      clientId: client.id,
      action: 'refresh_token_client_mismatch_logic',
      resource: 'oauth/token_logic',
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'Refresh token was issued to a different client (logic check)',
      metadata: {
        grantType: 'refresh_token',
        tokenClientId: storedRefreshToken.clientId,
        currentClientId: client.id,
      },
    });
    throw new ApiError(
      400,
      'Refresh token was issued to a different client',
      OAuth2ErrorTypes.INVALID_GRANT
    );
  }

  // Handle scope parameter for refresh token
  const originalScopes = ScopeUtils.parseScopes(storedRefreshToken.scope ?? '');
  let finalGrantedScope = storedRefreshToken.scope ?? undefined;

  if (requestedScope) {
    const requestedScopeArray = ScopeUtils.parseScopes(requestedScope);
    // Ensure all requested scopes are within the original scope
    const scopeValidation = ScopeUtils.validateScopes(requestedScopeArray, originalScopes);
    if (!scopeValidation.valid) {
      await AuthorizationUtils.logAuditEvent({
        clientId: client.id,
        userId: storedRefreshToken.userId ?? undefined,
        action: 'refresh_token_invalid_scope',
        resource: 'oauth/token_logic',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Requested scope is invalid or exceeds originally granted scope. Invalid: ${scopeValidation.invalidScopes.join(', ')}`,
        metadata: {
          grantType: 'refresh_token',
          requestedScope,
          originalScope: storedRefreshToken.scope,
        },
      });
      throw new ApiError(
        400,
        'Requested scope is invalid or exceeds originally granted scope',
        OAuth2ErrorTypes.INVALID_SCOPE
      );
    }
    finalGrantedScope = requestedScope; // If valid, the new token gets the (potentially narrowed) requested scope
  }

  // Get permissions if user is involved
  let permissions: string[] = [];
  if (storedRefreshToken.userId) {
    permissions = await AuthorizationUtils.getUserPermissions(storedRefreshToken.userId);
  }

  // Generate new access token
  const newAccessToken = await JWTUtils.createAccessToken({
    client_id: client.clientId, // Use client.clientId from the authenticated client object
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope,
    permissions,
    // exp: '1h' // Default in JWTUtils.createAccessToken
  });
  const newAccessTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex');

  // Store new access token in database
  await prisma.accessToken.create({
    data: {
      token: newAccessToken, // Storing full token (consider if this is needed or just hash)
      tokenHash: newAccessTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addHours(new Date(), 1), // Consistent with JWTUtils default
      revoked: false,
    },
  });

  // Create new refresh token (rotation)
  const newRefreshTokenValue = await JWTUtils.createRefreshToken({
    client_id: client.clientId,
    user_id: storedRefreshToken.userId ?? undefined,
    scope: finalGrantedScope, // New refresh token should also carry the potentially narrowed scope
    // exp: '30d' // Default in JWTUtils.createRefreshToken
  });
  const newRefreshTokenHash = crypto
    .createHash('sha256')
    .update(newRefreshTokenValue)
    .digest('hex');

  // Revoke old refresh token
  await prisma.refreshToken.update({
    where: { id: storedRefreshToken.id },
    data: { revoked: true, revokedAt: new Date(), replacedByTokenId: newRefreshTokenHash }, // Optional: link to new token
  });

  // Store new refresh token
  await prisma.refreshToken.create({
    data: {
      token: newRefreshTokenValue, // Storing full token (consider if this is needed or just hash)
      tokenHash: newRefreshTokenHash,
      clientId: client.id,
      userId: storedRefreshToken.userId ?? undefined,
      scope: finalGrantedScope,
      expiresAt: addDays(new Date(), 30), // Consistent with JWTUtils default
      revoked: false,
      previousTokenId: storedRefreshToken.id, // Optional: link to old token
    },
  });

  // Log successful token refresh
  await AuthorizationUtils.logAuditEvent({
    clientId: client.id,
    userId: storedRefreshToken.userId ?? undefined,
    action: 'token_refreshed_logic',
    resource: 'oauth/token_logic',
    ipAddress,
    userAgent,
    success: true,
    metadata: {
      grantType: 'refresh_token',
      scope: finalGrantedScope,
      newAccessTokenId: newAccessTokenHash.substring(0, 10), // Example: log part of hash
      newRefreshTokenId: newRefreshTokenHash.substring(0, 10),
    },
  });

  return {
    accessToken: newAccessToken,
    tokenType: 'Bearer',
    expiresIn: 3600, // Standard 1 hour
    newRefreshToken: newRefreshTokenValue, // Send the new refresh token back
    scope: finalGrantedScope,
  };
}
