export { A as AccessTokenPayload, I as IdTokenPayload, b as JWTUtils, R as RefreshTokenPayload, g as getUserIdFromRequest } from '../jwt-utils-BXzO0_Pg.js';
import { OAuthClient } from '@prisma/client';
import { z } from 'zod';
import 'jose';
import 'next/server';

/**
 * PKCE (Proof Key for Code Exchange) 通用工具类
 * PKCE (Proof Key for Code Exchange) Universal Utility Class
 *
 * 实现 RFC 7636 规范，用于增强 OAuth 2.0 公共客户端安全性
 * Implements RFC 7636 specification for enhancing OAuth 2.0 public client security
 *
 * @author OAuth团队
 * @since 2.0.0
 */
/**
 * PKCE验证结果接口
 * PKCE validation result interface
 */
interface PKCEValidationResult {
    isValid: boolean;
    error?: string;
}
/**
 * PKCE参数接口
 * PKCE parameters interface
 */
interface PKCEParams {
    codeVerifier?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
}
/**
 * 生成一个符合 RFC 7636 规范的随机 code_verifier
 * (Generates a random code_verifier compliant with RFC 7636)
 *
 * @returns 返回一个 Base64URL 编码的随机字符串，长度为43-128个字符
 * (Returns a Base64URL encoded random string, 43-128 characters long)
 */
declare function generateCodeVerifier(): string;
/**
 * 根据给定的 code_verifier 生成 code_challenge (使用 S256 方法)
 * (Generates code_challenge from given code_verifier using S256 method)
 *
 * @param verifier - 客户端生成的 code_verifier (Client-generated code_verifier)
 * @returns 返回计算得到的 code_challenge (Base64URL 编码) (Returns calculated code_challenge (Base64URL encoded))
 */
declare function generateCodeChallenge(verifier: string): string;
/**
 * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配
 * (Verifies if provided code_verifier matches expected code_challenge)
 *
 * @param verifier - 客户端在令牌请求中提供的 code_verifier (code_verifier provided by client in token request)
 * @param challenge - 授权服务器存储的 code_challenge (code_challenge stored by authorization server)
 * @param method - 生成 code_challenge 时使用的方法，默认为 'S256' (Method used to generate code_challenge, defaults to 'S256')
 * @returns 如果验证成功则返回 true，否则返回 false (Returns true if verification succeeds, false otherwise)
 */
declare function verifyCodeChallenge(verifier: string, challenge: string, method?: string): boolean;
/**
 * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_challenge string format complies with RFC 7636)
 *
 * @param challenge - 要验证的 code_challenge 字符串 (code_challenge string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
declare function validateCodeChallenge(challenge: string): boolean;
/**
 * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_verifier string format complies with RFC 7636)
 *
 * @param verifier - 要验证的 code_verifier 字符串 (code_verifier string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
declare function validateCodeVerifier(verifier: string): boolean;
/**
 * 检查是否支持指定的 code_challenge_method
 * (Checks if specified code_challenge_method is supported)
 *
 * @param method - 要检查的方法 (Method to check)
 * @returns 如果支持则返回 true (Returns true if supported)
 */
declare function isSupportedChallengeMethod(method: string): boolean;
/**
 * 全面验证PKCE参数
 * (Comprehensive PKCE parameters validation)
 *
 * @param params - PKCE参数 (PKCE parameters)
 * @returns 验证结果 (Validation result)
 */
declare function validatePKCEParams(params: PKCEParams): PKCEValidationResult;
/**
 * 生成完整的PKCE参数对
 * (Generates complete PKCE parameter pair)
 *
 * @returns 包含 code_verifier 和 code_challenge 的对象 (Object containing code_verifier and code_challenge)
 */
declare function generatePKCEPair(): {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: string;
};
/**
 * 为了兼容旧代码中 PKCEUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
declare const PKCEUtils: {
    readonly generateCodeVerifier: typeof generateCodeVerifier;
    readonly generateCodeChallenge: typeof generateCodeChallenge;
    readonly verifyCodeChallenge: typeof verifyCodeChallenge;
    readonly validateCodeChallenge: typeof validateCodeChallenge;
    readonly validateCodeVerifier: typeof validateCodeVerifier;
    readonly isSupportedChallengeMethod: typeof isSupportedChallengeMethod;
    readonly validatePKCEParams: typeof validatePKCEParams;
    readonly generatePKCEPair: typeof generatePKCEPair;
};

/**
 * 将以空格分隔的 scope 字符串解析为字符串数组
 * (Parses a space-separated scope string into an array of strings)
 */
declare function parseScopes(scopeString?: string): string[];
/**
 * 将 scope 字符串数组格式化为以空格分隔的单个字符串
 * (Formats an array of scope strings into a single space-separated string)
 */
declare function formatScopes(scopes: string[]): string;
/**
 * 检查用户权限范围是否包含指定的权限
 * (Checks if user scopes contain a specific scope)
 */
declare function hasScope(userScopes: string[], requiredScope: string): boolean;
/**
 * 检查用户权限范围是否包含任意一个指定的权限
 * (Checks if user scopes contain any of the specified scopes)
 */
declare function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean;
/**
 * 检查用户权限范围是否包含所有指定的权限
 * (Checks if user scopes contain all specified scopes)
 */
declare function hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean;
/**
 * 验证scope字符串格式是否合法
 * (Validates if scope string format is valid)
 */
declare function isValidScopeFormat(scope: string): boolean;
/**
 * 验证scope数组中的所有scope格式是否合法
 * (Validates if all scopes in array have valid format)
 */
declare function validateScopeFormats(scopes: string[]): {
    valid: boolean;
    invalidScopes: string[];
};
/**
 * 重载签名
 */
declare function validateScopes(requestedScopes: string[], allowedScopes: string[]): {
    valid: boolean;
    invalidScopes: string[];
    error_description?: string;
};
declare function validateScopes(requestedScopes: string[], client: OAuthClient): Promise<{
    valid: boolean;
    invalidScopes: string[];
    error_description?: string;
}>;
/**
 * 过滤出有效的权限范围
 * (Filters out valid scopes)
 */
declare function filterValidScopes(requestedScopes: string[], allowedScopes: string[]): string[];
/**
 * 判断是否是 OpenID Connect 相关的scope
 * (Checks if it's an OpenID Connect related scope)
 */
declare function isOpenIdConnectScope(scope: string): boolean;
/**
 * 从scope数组中提取所有OIDC相关的scope
 * (Extracts all OIDC related scopes from a scope array)
 */
declare function extractOpenIdConnectScopes(scopes: string[]): string[];
/**
 * 从scope数组中提取所有非OIDC的自定义scope
 * (Extracts all non-OIDC custom scopes from a scope array)
 */
declare function extractCustomScopes(scopes: string[]): string[];
/**
 * 判断授权请求是否包含OIDC的scope
 * (Checks if authorization request includes OIDC scopes)
 */
declare function isOpenIdConnectRequest(scopes: string[]): boolean;
/**
 * 规范化scopes，去除重复并排序
 * (Normalizes scopes, removes duplicates and sorts)
 */
declare function normalizeScopes(scopes: string[]): string[];
/**
 * 计算两个scope数组的交集
 * (Calculates intersection of two scope arrays)
 */
declare function intersectScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 计算两个scope数组的并集
 * (Calculates union of two scope arrays)
 */
declare function unionScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 计算两个scope数组的差集 (scopes1 - scopes2)
 * (Calculates difference of two scope arrays (scopes1 - scopes2))
 */
declare function differenceScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 为了兼容旧代码中 ScopeUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
declare const ScopeUtils: {
    readonly parseScopes: typeof parseScopes;
    readonly formatScopes: typeof formatScopes;
    readonly hasScope: typeof hasScope;
    readonly hasAnyScope: typeof hasAnyScope;
    readonly hasAllScopes: typeof hasAllScopes;
    readonly isValidScopeFormat: typeof isValidScopeFormat;
    readonly validateScopeFormats: typeof validateScopeFormats;
    readonly validateScopes: typeof validateScopes;
    readonly filterValidScopes: typeof filterValidScopes;
    readonly isOpenIdConnectScope: typeof isOpenIdConnectScope;
    readonly extractOpenIdConnectScopes: typeof extractOpenIdConnectScopes;
    readonly extractCustomScopes: typeof extractCustomScopes;
    readonly isOpenIdConnectRequest: typeof isOpenIdConnectRequest;
    readonly normalizeScopes: typeof normalizeScopes;
    readonly intersectScopes: typeof intersectScopes;
    readonly unionScopes: typeof unionScopes;
    readonly differenceScopes: typeof differenceScopes;
};

/**
 * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
 * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
 */
declare function validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean;
/**
 * 验证response_type是否是服务器支持的类型
 * Validates if the response_type is supported by the server
 */
declare function validateResponseType(responseType: string, supportedTypes?: string[]): boolean;
/** 生成随机state */
declare function generateState(): string;
/** 生成随机nonce (主要用于OIDC) */
declare function generateNonce(): string;
/** 生成安全的授权码 */
declare function generateAuthorizationCode(): string;
/**
 * 记录审计事件到数据库 (Logs an audit event)
 */
declare function logAuditEvent(event: {
    userId?: string;
    clientId?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    actorType?: string;
    actorId?: string;
    status?: string;
    details?: string;
}): Promise<void>;
/** 获取用户权限 */
declare function getUserPermissions(userId: string): Promise<string[]>;
/**
 * 为了兼容旧代码中 AuthorizationUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
declare const AuthorizationUtils: {
    readonly validateRedirectUri: typeof validateRedirectUri;
    readonly validateResponseType: typeof validateResponseType;
    readonly generateState: typeof generateState;
    readonly generateNonce: typeof generateNonce;
    readonly generateAuthorizationCode: typeof generateAuthorizationCode;
    readonly logAuditEvent: typeof logAuditEvent;
    readonly getUserPermissions: typeof getUserPermissions;
};

/**
 * 使用 Zod 定义密码复杂度的验证模式 (Schema)。
 * 规则:
 * 1. 最小长度: 密码长度必须至少为 `PASSWORD_MIN_LENGTH` (当前为8) 个字符。
 * 2. 字符类别: 密码必须包含以下至少两类字符：
 *    - 小写字母 (a-z)
 *    - 大写字母 (A-Z)
 *    - 数字 (0-9)
 *    - 特殊字符 (从 `SPECIAL_CHARACTERS` 常量中定义的字符集)
 * @security 安全考虑: 这些复杂度规则旨在增强密码的强度，使其更难被猜测或破解。
 *           强制使用多种字符类别可以显著增加密码的熵。
 */
declare const PasswordComplexitySchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * 生成一个符合预定义复杂度要求的安全密码。
 * @param length - (可选) 生成密码的期望长度，默认为12。如果小于 `PASSWORD_MIN_LENGTH`，则使用 `PASSWORD_MIN_LENGTH`。
 * @returns 返回生成的随机密码字符串。
 * @security 安全考虑: 使用 `crypto.randomInt` 生成随机索引以选择字符，确保密码的随机性。
 *           确保密码包含多种字符类型，并打乱顺序，以增加破解难度。
 */
declare function generateSecurePassword(length?: number): string;
/**
 * 检查新密码是否在用户的近期密码历史中已存在 (防止密码重用)。
 * @param userId - 用户的ID。
 * @param newPasswordRaw - 用户提供的新原始密码 (未哈希)。
 * @param historyLimit - (可选) 要检查的近期密码历史记录数量，默认为5。
 * @returns 返回一个 Promise<boolean>。如果新密码与近期历史密码之一匹配，则返回 `false` (表示不应使用此密码)；
 *          否则返回 `true` (表示密码在历史记录方面有效)。
 * @security 安全考虑: 防止密码重用是重要的安全实践。如果攻击者获取了一个旧密码，
 *           此机制可以阻止他们使用该旧密码重新访问账户 (如果用户已更改密码)。
 */
declare function checkPasswordHistory(userId: string, // 用户ID
newPasswordRaw: string, // 新的明文密码
historyLimit?: number): Promise<boolean>;
/**
 * bcrypt 哈希算法的盐轮数 (Salt Rounds)。
 * 这个值决定了哈希密码的计算成本。值越高，哈希过程越慢，从而使暴力破解更困难。
 * 一般推荐值为 10 到 12。增加此值会增加服务器的 CPU 负载。
 * @security 安全考虑: 适当的盐轮数对于密码哈希的强度至关重要。
 *           不应使用过低的值 (例如 < 10)。需要根据服务器性能和安全需求进行权衡。
 */
declare const SALT_ROUNDS = 10;

/**
 * 认证模块类型定义
 * Authentication module type definitions
 */
interface JWTPayload {
    sub: string;
    iat: number;
    exp: number;
    aud?: string | string[];
    iss?: string;
    scope?: string;
    client_id?: string;
    user_id?: string;
    token_type?: string;
    jti?: string;
}
interface JWTOptions {
    algorithm?: string;
    expiresIn?: string | number;
    audience?: string | string[];
    issuer?: string;
    subject?: string;
}
interface TokenValidationResult {
    valid: boolean;
    payload?: JWTPayload;
    error?: string;
}
interface PKCEChallenge {
    codeChallenge: string;
    codeChallengeMethod: string;
    codeVerifier: string;
}
interface ScopeValidationResult {
    valid: boolean;
    validScopes: string[];
    invalidScopes: string[];
}
interface PasswordHashResult {
    hash: string;
    salt: string;
}

export { AuthorizationUtils, type JWTOptions, type JWTPayload, type PKCEChallenge, PKCEUtils, PasswordComplexitySchema, type PasswordHashResult, SALT_ROUNDS, ScopeUtils, type ScopeValidationResult, type TokenValidationResult, checkPasswordHistory, generateSecurePassword };
