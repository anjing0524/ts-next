import * as jose from 'jose';
import * as crypto from 'crypto';
import { prisma } from '@repo/database';
import { ConfigurationError } from '../../errors';
import type { User, OAuthClient as Client } from '@prisma/client';

/**
 * JWT工具类 - 提供JWT令牌的创建、验证和管理功能
 * JWT utility class - provides JWT token creation, verification and management functions
 */
export class JWTUtils {
  /**
   * 获取用于 JWT 签名的 RSA 私钥
   * Get RSA private key for JWT signing
   */
  private static async getRSAPrivateKeyForSigning() {
    const pem = process.env.JWT_PRIVATE_KEY_PEM;
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';

    if (!pem) {
      const errorMessage =
        'JWT_PRIVATE_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new ConfigurationError(errorMessage); // 使用 ConfigurationError (Use ConfigurationError)
      }
      console.error(errorMessage);
      throw new ConfigurationError(errorMessage);
    }
    try {
      return await jose.importPKCS8(pem, algorithm as string);
    } catch (error) {
      console.error('Failed to import RSA private key (PKCS8):', error);
      throw new ConfigurationError('Invalid RSA private key (JWT_PRIVATE_KEY_PEM) format or configuration.', { originalError: (error as Error).message });
    }
  }

  /**
   * 获取用于 JWT 验证的 RSA 公钥
   * Get RSA public key for JWT verification
   */
  private static async getRSAPublicKeyForVerification() {
    const pem = process.env.JWT_PUBLIC_KEY_PEM;
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';

    if (!pem) {
      const errorMessage =
        'JWT_PUBLIC_KEY_PEM is not set. Please configure it via environment variables.';
      if (process.env.NODE_ENV === 'production') {
        console.error(`${errorMessage} (Production)`);
        throw new ConfigurationError(errorMessage);
      }
      console.error(errorMessage);
      throw new ConfigurationError(errorMessage);
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
          'Invalid RSA public key (JWT_PUBLIC_KEY_PEM) format or configuration. Supported formats: SPKI PEM, X.509 PEM.', { originalError: (x509Error as Error).message }
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
        throw new ConfigurationError('JWT_ISSUER is not set in production environment');
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
        throw new ConfigurationError('JWT_AUDIENCE is not set in production environment');
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
   * 创建 OpenID Connect ID Token
   * Create OpenID Connect ID Token
   */
  static async createIdToken(user: User, client: Client, nonce?: string): Promise<string> {
    const algorithm = process.env.JWT_ALGORITHM || 'RS256';
    const keyId = process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      sub: user.id,
      aud: client.clientId,
      iss: this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      auth_time: user.lastLoginAt ? Math.floor(user.lastLoginAt.getTime() / 1000) : Math.floor(Date.now() / 1000),
      // 基本的 OIDC 声明 (Basic OIDC claims)
      preferred_username: user.username,
      name: user.displayName || undefined,
      given_name: user.firstName || undefined,
      family_name: user.lastName || undefined,
      picture: user.avatar || undefined,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000),
    };

    if (nonce) {
      jwtPayload.nonce = nonce;
    }

    // 清理 undefined 值 (Clean up undefined values)
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime('1h') // ID Token 通常较短生命周期 (ID Token usually has shorter lifetime)
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 解码令牌载荷（不验证签名）
   * Decode token payload (without signature verification)
   */
  static async decodeTokenPayload(token: string, secret?: string): Promise<jose.JWTPayload> {
    try {
      // 如果提供了 secret，使用 HS256 算法验证
      // If secret is provided, verify using HS256 algorithm
      if (secret) {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jose.jwtVerify(token, secretKey, {
          algorithms: ['HS256'],
        });
        return payload;
      } else {
        // 否则只解码不验证 (Otherwise just decode without verification)
        return jose.decodeJwt(token);
      }
    } catch (error) {
      console.error('Token decode error:', error);
      throw new Error('Failed to decode token payload');
    }
  }

  /**
   * 验证并解码 Refresh Token，返回类型化的载荷
   * Verify and decode Refresh Token, return typed payload
   */
  static async verifyAndDecodeRefreshToken(token: string, client: Client): Promise<RefreshTokenPayload> {
    const verificationResult = await this.verifyRefreshToken(token);
    
    if (!verificationResult.valid || !verificationResult.payload) {
      throw new Error(verificationResult.error || 'Invalid refresh token');
    }

    const payload = verificationResult.payload as RefreshTokenPayload;
    
    // 验证客户端匹配 (Verify client match)
    if (payload.client_id !== client.clientId) {
      throw new Error('Refresh token does not belong to the requesting client');
    }

    return payload;
  }
}

/**
 * Refresh Token 载荷接口
 * Refresh Token payload interface
 */
export interface RefreshTokenPayload extends jose.JWTPayload {
  client_id: string;
  user_id?: string;
  scope?: string;
  token_type: string;
} 