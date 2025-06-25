/**
 * JWT (JSON Web Token) 通用工具类
 * JWT (JSON Web Token) Universal Utility Class
 * 
 * 提供JWT令牌的创建、验证、解析等通用功能
 * Provides universal JWT token creation, verification, parsing functionality
 * 
 * @author OAuth团队
 * @since 2.0.0
 */

import * as jose from 'jose';
import * as crypto from 'crypto';

/**
 * JWT负载基础接口
 * JWT payload base interface
 */
export interface BaseTokenPayload {
  client_id: string;
  sub?: string;
  scope?: string;
  permissions?: string[];
  exp?: string;
}

/**
 * 访问令牌负载接口
 * Access token payload interface
 */
export interface AccessTokenPayload extends BaseTokenPayload {
  user_id?: string;
  aud?: string | string[];
}

/**
 * 刷新令牌负载接口
 * Refresh token payload interface
 */
export interface RefreshTokenPayload extends jose.JWTPayload {
  client_id: string;
  user_id?: string;
  scope?: string;
  token_type: 'refresh_token';
}

/**
 * ID令牌负载接口 (OpenID Connect)
 * ID token payload interface (OpenID Connect)
 */
export interface IdTokenPayload {
  sub: string;
  aud: string;
  iss?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * JWT验证结果接口
 * JWT verification result interface
 */
export interface JWTVerificationResult {
  valid: boolean;
  payload?: jose.JWTPayload;
  error?: string;
}

/**
 * JWT配置接口
 * JWT configuration interface
 */
export interface JWTConfig {
  algorithm?: string;
  keyId?: string;
  issuer?: string;
  audience?: string | string[];
  expiresIn?: string;
}

/**
 * JWT工具类
 * JWT utility class
 * 
 * 提供JWT令牌的创建、验证、解析等功能
 * Provides JWT token creation, verification, parsing functionality
 */
export class JWTUtils {
  /**
   * 获取JWT签发者
   * (Gets JWT issuer)
   */
  static getIssuer(): string {
    const issuer = process.env.JWT_ISSUER;
    if (!issuer) {
      throw new Error('JWT_ISSUER environment variable is required');
    }
    return issuer;
  }

  /**
   * 获取JWT受众
   * (Gets JWT audience)
   */
  static getAudience(): string {
    const audience = process.env.JWT_AUDIENCE;
    if (!audience) {
      throw new Error('JWT_AUDIENCE environment variable is required');
    }
    return audience;
  }

  /**
   * 获取RSA私钥用于签名
   * (Gets RSA private key for signing)
   */
  static async getRSAPrivateKeyForSigning(): Promise<jose.KeyLike> {
    const privateKeyPEM = process.env.JWT_PRIVATE_KEY;
    if (!privateKeyPEM) {
      throw new Error('JWT_PRIVATE_KEY environment variable is required');
    }
    
    try {
      return await jose.importPKCS8(privateKeyPEM, 'RS256');
    } catch (error) {
      throw new Error(`Failed to import JWT private key: ${error}`);
    }
  }

  /**
   * 获取RSA公钥用于验证
   * (Gets RSA public key for verification)
   */
  static async getRSAPublicKeyForVerification(): Promise<jose.KeyLike> {
    const publicKeyPEM = process.env.JWT_PUBLIC_KEY;
    if (!publicKeyPEM) {
      throw new Error('JWT_PUBLIC_KEY environment variable is required');
    }
    
    try {
      return await jose.importSPKI(publicKeyPEM, 'RS256');
    } catch (error) {
      throw new Error(`Failed to import JWT public key: ${error}`);
    }
  }

  /**
   * 创建访问令牌
   * (Creates an access token)
   * 
   * @param payload - 令牌负载 (Token payload)
   * @param config - JWT配置 (JWT configuration)
   * @returns Promise<string> - 签名后的JWT令牌 (Signed JWT token)
   */
  static async createAccessToken(
    payload: AccessTokenPayload,
    config?: Partial<JWTConfig>
  ): Promise<string> {
    const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      sub: payload.user_id || payload.client_id,
      aud: config?.audience || this.getAudience(),
      iss: config?.issuer || this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      permissions: payload.permissions || [],
    };

    // 清理undefined值
    // Clean up undefined values
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(config?.expiresIn || payload.exp || '1h')
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 创建刷新令牌
   * (Creates a refresh token)
   * 
   * @param payload - 刷新令牌负载 (Refresh token payload)
   * @param config - JWT配置 (JWT configuration)
   * @returns Promise<string> - 签名后的刷新令牌 (Signed refresh token)
   */
  static async createRefreshToken(
    payload: RefreshTokenPayload,
    config?: Partial<JWTConfig>
  ): Promise<string> {
    const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      client_id: payload.client_id,
      sub: payload.user_id || payload.client_id,
      aud: config?.audience || this.getAudience(),
      iss: config?.issuer || this.getIssuer(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      scope: payload.scope,
      token_type: 'refresh_token',
    };

    // 清理undefined值
    // Clean up undefined values
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(config?.expiresIn || '30d')
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 创建ID令牌 (OpenID Connect)
   * (Creates an ID token for OpenID Connect)
   * 
   * @param payload - ID令牌负载 (ID token payload)
   * @param config - JWT配置 (JWT configuration)
   * @returns Promise<string> - 签名后的ID令牌 (Signed ID token)
   */
  static async createIdToken(
    payload: IdTokenPayload,
    config?: Partial<JWTConfig>
  ): Promise<string> {
    const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
    const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

    const jwtPayload: jose.JWTPayload = {
      sub: payload.sub,
      aud: payload.aud,
      iss: config?.issuer || this.getIssuer(),
      iat: payload.iat || Math.floor(Date.now() / 1000),
      exp: payload.exp,
      nonce: payload.nonce,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

    // 清理undefined值
    // Clean up undefined values
    Object.keys(jwtPayload).forEach(
      (key) => jwtPayload[key] === undefined && delete jwtPayload[key]
    );

    return await new jose.SignJWT(jwtPayload)
      .setProtectedHeader({ alg: algorithm, kid: keyId })
      .setExpirationTime(config?.expiresIn || '1h')
      .sign(await this.getRSAPrivateKeyForSigning());
  }

  /**
   * 验证访问令牌
   * (Verifies an access token)
   * 
   * @param token - 要验证的JWT令牌 (JWT token to verify)
   * @param config - JWT配置 (JWT configuration)
   * @returns Promise<JWTVerificationResult> - 验证结果 (Verification result)
   */
  static async verifyAccessToken(
    token: string,
    config?: Partial<JWTConfig>
  ): Promise<JWTVerificationResult> {
    try {
      const { payload } = await jose.jwtVerify(
        token,
        await this.getRSAPublicKeyForVerification(),
        {
          issuer: config?.issuer || this.getIssuer(),
          audience: config?.audience || this.getAudience(),
          algorithms: [config?.algorithm || 'RS256'],
        }
      );

      return {
        valid: true,
        payload,
      };
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
   * 验证刷新令牌
   * (Verifies a refresh token)
   * 
   * @param token - 要验证的刷新令牌 (Refresh token to verify)
   * @param config - JWT配置 (JWT configuration)
   * @returns Promise<JWTVerificationResult> - 验证结果 (Verification result)
   */
  static async verifyRefreshToken(
    token: string,
    config?: Partial<JWTConfig>
  ): Promise<JWTVerificationResult> {
    try {
      const { payload } = await jose.jwtVerify(
        token,
        await this.getRSAPublicKeyForVerification(),
        {
          issuer: config?.issuer || this.getIssuer(),
          audience: config?.audience || this.getAudience(),
          algorithms: [config?.algorithm || 'RS256'],
        }
      );

      if (payload.token_type !== 'refresh_token') {
        return { valid: false, error: 'Invalid token type: expected refresh token' };
      }

      return {
        valid: true,
        payload,
      };
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
   * 解码JWT令牌而不验证签名 (仅用于调试)
   * (Decodes JWT token without signature verification - for debugging only)
   * 
   * @param token - JWT令牌 (JWT token)
   * @returns jose.JWTPayload | null - 解码后的负载或null (Decoded payload or null)
   */
  static decodeToken(token: string): jose.JWTPayload | null {
    try {
      return jose.decodeJwt(token);
    } catch {
      return null;
    }
  }

  /**
   * 获取令牌哈希值用于存储
   * (Gets token hash for storage)
   * 
   * @param token - JWT令牌 (JWT token)
   * @returns string - SHA256哈希值 (SHA256 hash)
   */
  static getTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 检查令牌是否即将过期
   * (Checks if token is about to expire)
   * 
   * @param token - JWT令牌 (JWT token)
   * @param thresholdSeconds - 过期阈值（秒） (Expiration threshold in seconds)
   * @returns boolean - 是否即将过期 (Whether token is about to expire)
   */
  static isTokenNearExpiry(token: string, thresholdSeconds: number = 300): boolean {
    try {
      const payload = this.decodeToken(token);
      if (!payload?.exp) return false;

      const expiryTime = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;

      return timeUntilExpiry <= thresholdSeconds * 1000;
    } catch {
      return true; // If we can't decode, assume it's expired
    }
  }

  /**
   * 获取令牌的主题（subject）
   * (Gets the subject from token)
   * 
   * @param token - JWT令牌 (JWT token)
   * @returns 主题或null (Subject or null)
   */
  static getSubjectFromToken(token: string): string | null {
    try {
      const payload = this.decodeToken(token);
      return payload?.sub as string || null;
    } catch {
      return null;
    }
  }

  /**
   * 从令牌中获取权限范围
   * (Gets scopes from token)
   * 
   * @param token - JWT令牌 (JWT token)
   * @returns 权限范围数组 (Array of scopes)
   */
  static getScopesFromToken(token: string): string[] {
    try {
      const payload = this.decodeToken(token);
      const scope = payload?.scope as string;
      return scope ? scope.split(' ').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /**
   * 解码令牌载荷（向后兼容方法）
   * (Decode token payload - backward compatibility method)
   * 
   * @param token - JWT令牌 (JWT token)
   * @param secret - 可选的密钥（用于HMAC验证） (Optional secret for HMAC verification)
   * @returns Promise<jose.JWTPayload> - 解码后的载荷 (Decoded payload)
   */
  static async decodeTokenPayload(token: string, secret?: string): Promise<jose.JWTPayload> {
    try {
      if (secret) {
        // 如果提供了密钥，使用HMAC验证
        // If secret is provided, use HMAC verification
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jose.jwtVerify(token, secretKey, {
          algorithms: ['HS256'],
        });
        return payload;
      } else {
        // 否则只解码不验证 (Otherwise just decode without verification)
        const payload = jose.decodeJwt(token);
        if (!payload) {
          throw new Error('Failed to decode token');
        }
        return payload;
      }
    } catch (error) {
      console.error('Token decode error:', error);
      throw new Error('Failed to decode token payload');
    }
  }

  /**
   * 验证并解码刷新令牌（向后兼容方法）
   * (Verify and decode refresh token - backward compatibility method)
   * 
   * @param token - 刷新令牌 (Refresh token)
   * @param client - 客户端对象 (Client object)
   * @returns Promise<RefreshTokenPayload> - 验证后的载荷 (Verified payload)
   */
  static async verifyAndDecodeRefreshToken(token: string, client: any): Promise<RefreshTokenPayload> {
    const verificationResult = await this.verifyRefreshToken(token);
    
    if (!verificationResult.valid || !verificationResult.payload) {
      throw new Error(verificationResult.error || 'Invalid refresh token');
    }

    // 安全的类型转换
    // Safe type conversion
    const payload = verificationResult.payload as unknown as RefreshTokenPayload;
    
    // 验证客户端匹配 (Verify client match)
    if (payload.client_id !== client.clientId) {
      throw new Error('Refresh token does not belong to the requesting client');
    }

    // 确保必要的字段存在
    // Ensure required fields exist
    if (!payload.token_type) {
      payload.token_type = 'refresh_token';
    }

    return payload;
  }

  /**
   * 从授权头中提取令牌
   * (Extracts token from authorization header)
   * 
   * @param authHeader - 授权头值 (Authorization header value)
   * @returns string | null - 提取的令牌或null (Extracted token or null)
   */
  static extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }
} 