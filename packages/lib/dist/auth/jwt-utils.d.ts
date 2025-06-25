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
export declare class JWTUtils {
    /**
     * 获取JWT签发者
     * (Gets JWT issuer)
     */
    static getIssuer(): string;
    /**
     * 获取JWT受众
     * (Gets JWT audience)
     */
    static getAudience(): string;
    /**
     * 获取RSA私钥用于签名
     * (Gets RSA private key for signing)
     */
    static getRSAPrivateKeyForSigning(): Promise<jose.KeyLike>;
    /**
     * 获取RSA公钥用于验证
     * (Gets RSA public key for verification)
     */
    static getRSAPublicKeyForVerification(): Promise<jose.KeyLike>;
    /**
     * 创建访问令牌
     * (Creates an access token)
     *
     * @param payload - 令牌负载 (Token payload)
     * @param config - JWT配置 (JWT configuration)
     * @returns Promise<string> - 签名后的JWT令牌 (Signed JWT token)
     */
    static createAccessToken(payload: AccessTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
    /**
     * 创建刷新令牌
     * (Creates a refresh token)
     *
     * @param payload - 刷新令牌负载 (Refresh token payload)
     * @param config - JWT配置 (JWT configuration)
     * @returns Promise<string> - 签名后的刷新令牌 (Signed refresh token)
     */
    static createRefreshToken(payload: RefreshTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
    /**
     * 创建ID令牌 (OpenID Connect)
     * (Creates an ID token for OpenID Connect)
     *
     * @param payload - ID令牌负载 (ID token payload)
     * @param config - JWT配置 (JWT configuration)
     * @returns Promise<string> - 签名后的ID令牌 (Signed ID token)
     */
    static createIdToken(payload: IdTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
    /**
     * 验证访问令牌
     * (Verifies an access token)
     *
     * @param token - 要验证的JWT令牌 (JWT token to verify)
     * @param config - JWT配置 (JWT configuration)
     * @returns Promise<JWTVerificationResult> - 验证结果 (Verification result)
     */
    static verifyAccessToken(token: string, config?: Partial<JWTConfig>): Promise<JWTVerificationResult>;
    /**
     * 验证刷新令牌
     * (Verifies a refresh token)
     *
     * @param token - 要验证的刷新令牌 (Refresh token to verify)
     * @param config - JWT配置 (JWT configuration)
     * @returns Promise<JWTVerificationResult> - 验证结果 (Verification result)
     */
    static verifyRefreshToken(token: string, config?: Partial<JWTConfig>): Promise<JWTVerificationResult>;
    /**
     * 解码JWT令牌而不验证签名 (仅用于调试)
     * (Decodes JWT token without signature verification - for debugging only)
     *
     * @param token - JWT令牌 (JWT token)
     * @returns jose.JWTPayload | null - 解码后的负载或null (Decoded payload or null)
     */
    static decodeToken(token: string): jose.JWTPayload | null;
    /**
     * 获取令牌哈希值用于存储
     * (Gets token hash for storage)
     *
     * @param token - JWT令牌 (JWT token)
     * @returns string - SHA256哈希值 (SHA256 hash)
     */
    static getTokenHash(token: string): string;
    /**
     * 检查令牌是否即将过期
     * (Checks if token is about to expire)
     *
     * @param token - JWT令牌 (JWT token)
     * @param thresholdSeconds - 过期阈值（秒） (Expiration threshold in seconds)
     * @returns boolean - 是否即将过期 (Whether token is about to expire)
     */
    static isTokenNearExpiry(token: string, thresholdSeconds?: number): boolean;
    /**
     * 获取令牌的主题（subject）
     * (Gets the subject from token)
     *
     * @param token - JWT令牌 (JWT token)
     * @returns 主题或null (Subject or null)
     */
    static getSubjectFromToken(token: string): string | null;
    /**
     * 从令牌中获取权限范围
     * (Gets scopes from token)
     *
     * @param token - JWT令牌 (JWT token)
     * @returns 权限范围数组 (Array of scopes)
     */
    static getScopesFromToken(token: string): string[];
    /**
     * 解码令牌载荷（向后兼容方法）
     * (Decode token payload - backward compatibility method)
     *
     * @param token - JWT令牌 (JWT token)
     * @param secret - 可选的密钥（用于HMAC验证） (Optional secret for HMAC verification)
     * @returns Promise<jose.JWTPayload> - 解码后的载荷 (Decoded payload)
     */
    static decodeTokenPayload(token: string, secret?: string): Promise<jose.JWTPayload>;
    /**
     * 验证并解码刷新令牌（向后兼容方法）
     * (Verify and decode refresh token - backward compatibility method)
     *
     * @param token - 刷新令牌 (Refresh token)
     * @param client - 客户端对象 (Client object)
     * @returns Promise<RefreshTokenPayload> - 验证后的载荷 (Verified payload)
     */
    static verifyAndDecodeRefreshToken(token: string, client: any): Promise<RefreshTokenPayload>;
    /**
     * 从授权头中提取令牌
     * (Extracts token from authorization header)
     *
     * @param authHeader - 授权头值 (Authorization header value)
     * @returns string | null - 提取的令牌或null (Extracted token or null)
     */
    static extractTokenFromHeader(authHeader: string): string | null;
}
//# sourceMappingURL=jwt-utils.d.ts.map