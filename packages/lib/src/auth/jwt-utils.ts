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

// ===== 函数实现区域 (Function implementations) =====

/**
 * 获取JWT签发者
 * (Gets JWT issuer)
 */
export function getIssuer(): string {
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
export function getAudience(): string {
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
export async function getRSAPrivateKeyForSigning(): Promise<jose.KeyLike> {
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
export async function getRSAPublicKeyForVerification(): Promise<jose.KeyLike> {
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
 */
export async function createAccessToken(
  payload: AccessTokenPayload,
  config?: Partial<JWTConfig>
): Promise<string> {
  const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
  const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

  const jwtPayload: jose.JWTPayload = {
    client_id: payload.client_id,
    sub: payload.user_id || payload.client_id,
    aud: config?.audience || getAudience(),
    iss: config?.issuer || getIssuer(),
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    scope: payload.scope,
    permissions: payload.permissions || [],
  };

  Object.keys(jwtPayload).forEach(
    key => (jwtPayload[key] === undefined) && delete jwtPayload[key]
  );

  return await new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg: algorithm, kid: keyId })
    .setExpirationTime(config?.expiresIn || payload.exp || '1h')
    .sign(await getRSAPrivateKeyForSigning());
}

/**
 * 创建刷新令牌
 * (Creates a refresh token)
 */
export async function createRefreshToken(
  payload: RefreshTokenPayload,
  config?: Partial<JWTConfig>
): Promise<string> {
  const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
  const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

  const jwtPayload: jose.JWTPayload = {
    client_id: payload.client_id,
    sub: payload.user_id || payload.client_id,
    aud: config?.audience || getAudience(),
    iss: config?.issuer || getIssuer(),
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    scope: payload.scope,
    token_type: 'refresh_token',
  };

  Object.keys(jwtPayload).forEach(
    key => (jwtPayload[key] === undefined) && delete jwtPayload[key]
  );

  return await new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg: algorithm, kid: keyId })
    .setExpirationTime(config?.expiresIn || '30d')
    .sign(await getRSAPrivateKeyForSigning());
}

/**
 * 创建ID令牌 (OpenID Connect)
 * (Creates an ID token for OpenID Connect)
 */
export async function createIdToken(
  payload: IdTokenPayload,
  config?: Partial<JWTConfig>
): Promise<string> {
  const algorithm = config?.algorithm || process.env.JWT_ALGORITHM || 'RS256';
  const keyId = config?.keyId || process.env.JWT_KEY_ID || 'default-kid';

  const jwtPayload: jose.JWTPayload = {
    sub: payload.sub,
    aud: payload.aud,
    iss: config?.issuer || getIssuer(),
    iat: payload.iat || Math.floor(Date.now() / 1000),
    exp: payload.exp,
    nonce: payload.nonce,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };

  Object.keys(jwtPayload).forEach(
    key => (jwtPayload[key] === undefined) && delete jwtPayload[key]
  );

  return await new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg: algorithm, kid: keyId })
    .setExpirationTime(config?.expiresIn || '1h')
    .sign(await getRSAPrivateKeyForSigning());
}

/**
 * 验证访问令牌
 * (Verifies an access token)
 */
export async function verifyAccessToken(
  token: string,
  config?: Partial<JWTConfig>
): Promise<JWTVerificationResult> {
  try {
    const publicKey = await getRSAPublicKeyForVerification();
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: config?.issuer || getIssuer(),
      audience: config?.audience || getAudience(),
      algorithms: [config?.algorithm || 'RS256'],
    });

    return { valid: true, payload };
  } catch (error: any) {
    let errorMessage = 'Token verification failed';
    if (error instanceof jose.errors.JWTExpired) {
      errorMessage = 'Token has expired';
    } else if (error instanceof jose.errors.JWSInvalid) {
      errorMessage = 'Invalid token signature';
    }
    return { valid: false, error: errorMessage };
  }
}

/**
 * 验证刷新令牌
 * (Verifies a refresh token)
 */
export async function verifyRefreshToken(
  token: string,
  config?: Partial<JWTConfig>
): Promise<JWTVerificationResult> {
  try {
    const publicKey = await getRSAPublicKeyForVerification();
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: config?.issuer || getIssuer(),
      audience: config?.audience || getAudience(),
      algorithms: [config?.algorithm || 'RS256'],
    });

    if (payload.token_type !== 'refresh_token') {
      return { valid: false, error: 'Invalid token type, expected refresh_token' };
    }

    return { valid: true, payload };
  } catch (error: any) {
    let errorMessage = 'Refresh token verification failed';
    if (error instanceof jose.errors.JWTExpired) {
      errorMessage = 'Refresh token has expired';
    } else if (error instanceof jose.errors.JWSInvalid) {
      errorMessage = 'Invalid refresh token signature';
    }
    return { valid: false, error: errorMessage };
  }
}

/**
 * 解码令牌（不验证签名）
 * (Decodes a token without verifying the signature)
 */
export function decodeToken(token: string): jose.JWTPayload | null {
  try {
    return jose.decodeJwt(token);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * 计算令牌的哈希值
 * (Calculates the hash of a token)
 */
export function getTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 检查令牌是否即将过期
 * (Checks if a token is nearing expiry)
 */
export function isTokenNearExpiry(token: string, thresholdSeconds: number = 300): boolean {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) {
    return false;
  }
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowInSeconds < thresholdSeconds;
}

/**
 * 从令牌中获取 subject (sub)
 * (Gets the subject (sub) from a token)
 */
export function getSubjectFromToken(token: string): string | null {
  const payload = decodeToken(token);
  return payload?.sub || null;
}

/**
 * 从令牌中获取 scopes
 * (Gets scopes from a token)
 */
export function getScopesFromToken(token: string): string[] {
  const payload = decodeToken(token);
  if (!payload || !payload.scope || typeof payload.scope !== 'string') {
    return [];
  }
  return payload.scope.split(' ').filter(s => s);
}

/**
 * 解码令牌负载
 * (Decodes token payload)
 */
export async function decodeTokenPayload(token: string, secret?: string): Promise<jose.JWTPayload> {
  if (!secret) {
    // 尝试在没有密钥的情况下解码（用于公钥验证）
    try {
      const decoded = jose.decodeJwt(token);
      return decoded;
    } catch (e: any) {
      throw new Error('Invalid token format');
    }
  }

  // 使用密钥验证和解码
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
  } catch (e: any) {
    if (e.code === 'ERR_JWT_EXPIRED') {
      throw new Error('Token has expired');
    }
    throw new Error('Invalid token');
  }
}

/**
 * 验证和解码刷新令牌
 * (Verifies and decodes a refresh token)
 */
export async function verifyAndDecodeRefreshToken(token: string, client: any): Promise<RefreshTokenPayload> {
  const result = await verifyRefreshToken(token);

  if (!result.valid || !result.payload) {
    throw new Error(result.error || 'Invalid refresh token');
  }

  const payload = result.payload as RefreshTokenPayload;
  
  if (payload.client_id !== client.clientId) {
    throw new Error('Refresh token was not issued to this client');
  }

  return payload;
}

/**
 * 从Authorization头中提取令牌
 * (Extracts token from Authorization header)
 */
export function extractTokenFromHeader(authHeader: string): string | null {
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 JWTUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export const JWTUtils = {
  getIssuer,
  getAudience,
  getRSAPrivateKeyForSigning,
  getRSAPublicKeyForVerification,
  createAccessToken,
  createRefreshToken,
  createIdToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenHash,
  isTokenNearExpiry,
  getSubjectFromToken,
  getScopesFromToken,
  decodeTokenPayload,
  verifyAndDecodeRefreshToken,
  extractTokenFromHeader,
} as const; 