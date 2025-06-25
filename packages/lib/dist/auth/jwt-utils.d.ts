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
 * 获取JWT签发者
 * (Gets JWT issuer)
 */
export declare function getIssuer(): string;
/**
 * 获取JWT受众
 * (Gets JWT audience)
 */
export declare function getAudience(): string;
/**
 * 获取RSA私钥用于签名
 * (Gets RSA private key for signing)
 */
export declare function getRSAPrivateKeyForSigning(): Promise<jose.KeyLike>;
/**
 * 获取RSA公钥用于验证
 * (Gets RSA public key for verification)
 */
export declare function getRSAPublicKeyForVerification(): Promise<jose.KeyLike>;
/**
 * 创建访问令牌
 * (Creates an access token)
 */
export declare function createAccessToken(payload: AccessTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
/**
 * 创建刷新令牌
 * (Creates a refresh token)
 */
export declare function createRefreshToken(payload: RefreshTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
/**
 * 创建ID令牌 (OpenID Connect)
 * (Creates an ID token for OpenID Connect)
 */
export declare function createIdToken(payload: IdTokenPayload, config?: Partial<JWTConfig>): Promise<string>;
/**
 * 验证访问令牌
 * (Verifies an access token)
 */
export declare function verifyAccessToken(token: string, config?: Partial<JWTConfig>): Promise<JWTVerificationResult>;
/**
 * 验证刷新令牌
 * (Verifies a refresh token)
 */
export declare function verifyRefreshToken(token: string, config?: Partial<JWTConfig>): Promise<JWTVerificationResult>;
/**
 * 解码令牌（不验证签名）
 * (Decodes a token without verifying the signature)
 */
export declare function decodeToken(token: string): jose.JWTPayload | null;
/**
 * 计算令牌的哈希值
 * (Calculates the hash of a token)
 */
export declare function getTokenHash(token: string): string;
/**
 * 检查令牌是否即将过期
 * (Checks if a token is nearing expiry)
 */
export declare function isTokenNearExpiry(token: string, thresholdSeconds?: number): boolean;
/**
 * 从令牌中获取 subject (sub)
 * (Gets the subject (sub) from a token)
 */
export declare function getSubjectFromToken(token: string): string | null;
/**
 * 从令牌中获取 scopes
 * (Gets scopes from a token)
 */
export declare function getScopesFromToken(token: string): string[];
/**
 * 解码令牌负载
 * (Decodes token payload)
 */
export declare function decodeTokenPayload(token: string, secret?: string): Promise<jose.JWTPayload>;
/**
 * 验证和解码刷新令牌
 * (Verifies and decodes a refresh token)
 */
export declare function verifyAndDecodeRefreshToken(token: string, client: any): Promise<RefreshTokenPayload>;
/**
 * 从Authorization头中提取令牌
 * (Extracts token from Authorization header)
 */
export declare function extractTokenFromHeader(authHeader: string): string | null;
/**
 * 为了兼容旧代码中 JWTUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export declare const JWTUtils: {
    readonly getIssuer: typeof getIssuer;
    readonly getAudience: typeof getAudience;
    readonly getRSAPrivateKeyForSigning: typeof getRSAPrivateKeyForSigning;
    readonly getRSAPublicKeyForVerification: typeof getRSAPublicKeyForVerification;
    readonly createAccessToken: typeof createAccessToken;
    readonly createRefreshToken: typeof createRefreshToken;
    readonly createIdToken: typeof createIdToken;
    readonly verifyAccessToken: typeof verifyAccessToken;
    readonly verifyRefreshToken: typeof verifyRefreshToken;
    readonly decodeToken: typeof decodeToken;
    readonly getTokenHash: typeof getTokenHash;
    readonly isTokenNearExpiry: typeof isTokenNearExpiry;
    readonly getSubjectFromToken: typeof getSubjectFromToken;
    readonly getScopesFromToken: typeof getScopesFromToken;
    readonly decodeTokenPayload: typeof decodeTokenPayload;
    readonly verifyAndDecodeRefreshToken: typeof verifyAndDecodeRefreshToken;
    readonly extractTokenFromHeader: typeof extractTokenFromHeader;
};
//# sourceMappingURL=jwt-utils.d.ts.map