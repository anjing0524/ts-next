/**
 * OAuth 2.0 Scope 通用工具类
 * OAuth 2.0 Scope Universal Utility Class
 *
 * 用于处理OAuth 2.0权限范围的解析、格式化和验证
 * Used for OAuth 2.0 scope parsing, formatting and validation
 *
 * @author OAuth团队
 * @since 2.0.0
 */
import type { OAuthClient } from '@prisma/client';
/**
 * Scope (权限范围) 工具类
 * (Scope utility class)
 *
 * Scope 用于定义客户端可以请求访问哪些受保护资源的权限
 * (Scope is used to define permissions a client can request to access protected resources)
 */
export declare class ScopeUtils {
    /**
     * 将以空格分隔的 scope 字符串解析为字符串数组
     * (Parses a space-separated scope string into an array of strings)
     *
     * @param scopeString - 包含一个或多个 scope 的字符串 (String containing one or more scopes)
     * @returns 返回一个包含各个 scope 的字符串数组 (Returns an array of strings, each being a scope)
     */
    static parseScopes(scopeString?: string): string[];
    /**
     * 将 scope 字符串数组格式化为以空格分隔的单个字符串
     * (Formats an array of scope strings into a single space-separated string)
     *
     * @param scopes - 包含一个或多个 scope 的字符串数组 (Array of strings containing one or more scopes)
     * @returns 返回格式化后的 scope 字符串 (Returns the formatted scope string)
     */
    static formatScopes(scopes: string[]): string;
    /**
     * 检查用户权限范围是否包含指定的权限
     * (Checks if user scopes contain a specific scope)
     *
     * @param userScopes - 用户拥有的权限范围数组 (Array of user's scopes)
     * @param requiredScope - 需要检查的权限 (Required scope to check)
     * @returns 如果用户拥有该权限则返回 true (Returns true if user has the scope)
     */
    static hasScope(userScopes: string[], requiredScope: string): boolean;
    /**
     * 检查用户权限范围是否包含任意一个指定的权限
     * (Checks if user scopes contain any of the specified scopes)
     *
     * @param userScopes - 用户拥有的权限范围数组 (Array of user's scopes)
     * @param requiredScopes - 需要检查的权限数组 (Array of required scopes to check)
     * @returns 如果用户拥有任意一个权限则返回 true (Returns true if user has any of the scopes)
     */
    static hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean;
    /**
     * 检查用户权限范围是否包含所有指定的权限
     * (Checks if user scopes contain all specified scopes)
     *
     * @param userScopes - 用户拥有的权限范围数组 (Array of user's scopes)
     * @param requiredScopes - 需要检查的权限数组 (Array of required scopes to check)
     * @returns 如果用户拥有所有权限则返回 true (Returns true if user has all scopes)
     */
    static hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean;
    /**
     * 验证scope字符串格式是否合法
     * (Validates if scope string format is valid)
     *
     * @param scope - 要验证的单个scope (Single scope to validate)
     * @returns 如果格式合法则返回 true (Returns true if format is valid)
     */
    static isValidScopeFormat(scope: string): boolean;
    /**
     * 验证scope数组中的所有scope格式是否合法
     * (Validates if all scopes in array have valid format)
     *
     * @param scopes - 要验证的scope数组 (Array of scopes to validate)
     * @returns 验证结果，包含是否合法和无效的scope (Validation result with validity and invalid scopes)
     */
    static validateScopeFormats(scopes: string[]): {
        valid: boolean;
        invalidScopes: string[];
    };
    /**
     * 简单的scope验证（针对字符串数组）
     * (Simple scope validation for string arrays)
     *
     * @param requestedScopes - 请求的权限范围数组 (Array of requested scopes)
     * @param allowedScopes - 允许的权限范围数组 (Array of allowed scopes)
     * @returns 验证结果 (Validation result)
     */
    static validateScopes(requestedScopes: string[], allowedScopes: string[]): {
        valid: boolean;
        invalidScopes: string[];
        error_description?: string;
    };
    /**
     * 高级scope验证（针对OAuthClient对象 - 包含数据库验证）
     * (Advanced scope validation for OAuthClient object - includes database validation)
     *
     * @param requestedScopes - 请求的权限范围数组 (Array of requested scopes)
     * @param client - OAuth客户端对象 (OAuth client object)
     * @returns Promise<验证结果> (Promise<validation result>)
     */
    static validateScopes(requestedScopes: string[], client: OAuthClient): Promise<{
        valid: boolean;
        invalidScopes: string[];
        error_description?: string;
    }>;
    /**
     * 过滤出有效的scope
     * (Filters out valid scopes)
     *
     * @param requestedScopes - 请求的权限范围数组 (Array of requested scopes)
     * @param allowedScopes - 允许的权限范围数组 (Array of allowed scopes)
     * @returns 有效的scope数组 (Array of valid scopes)
     */
    static filterValidScopes(requestedScopes: string[], allowedScopes: string[]): string[];
    /**
     * 检查scope是否为标准的OpenID Connect scope
     * (Checks if scope is a standard OpenID Connect scope)
     *
     * @param scope - 要检查的scope (Scope to check)
     * @returns 如果是OIDC标准scope则返回true (Returns true if it's a standard OIDC scope)
     */
    static isOpenIdConnectScope(scope: string): boolean;
    /**
     * 从scope数组中提取OpenID Connect scope
     * (Extracts OpenID Connect scopes from scope array)
     *
     * @param scopes - scope数组 (Array of scopes)
     * @returns OpenID Connect scope数组 (Array of OpenID Connect scopes)
     */
    static extractOpenIdConnectScopes(scopes: string[]): string[];
    /**
     * 从scope数组中提取自定义scope（非OIDC标准scope）
     * (Extracts custom scopes from scope array - non-OIDC standard scopes)
     *
     * @param scopes - scope数组 (Array of scopes)
     * @returns 自定义scope数组 (Array of custom scopes)
     */
    static extractCustomScopes(scopes: string[]): string[];
    /**
     * 检查scope数组是否包含openid scope（表示这是一个OIDC请求）
     * (Checks if scope array contains openid scope - indicating this is an OIDC request)
     *
     * @param scopes - scope数组 (Array of scopes)
     * @returns 如果包含openid scope则返回true (Returns true if contains openid scope)
     */
    static isOpenIdConnectRequest(scopes: string[]): boolean;
    /**
     * 规范化scope数组（去重、排序、过滤空值）
     * (Normalizes scope array - deduplication, sorting, filtering empty values)
     *
     * @param scopes - 原始scope数组 (Original scope array)
     * @returns 规范化后的scope数组 (Normalized scope array)
     */
    static normalizeScopes(scopes: string[]): string[];
    /**
     * 计算两个scope数组的交集
     * (Calculates intersection of two scope arrays)
     *
     * @param scopes1 - 第一个scope数组 (First scope array)
     * @param scopes2 - 第二个scope数组 (Second scope array)
     * @returns 交集scope数组 (Intersection scope array)
     */
    static intersectScopes(scopes1: string[], scopes2: string[]): string[];
    /**
     * 计算两个scope数组的并集
     * (Calculates union of two scope arrays)
     *
     * @param scopes1 - 第一个scope数组 (First scope array)
     * @param scopes2 - 第二个scope数组 (Second scope array)
     * @returns 并集scope数组 (Union scope array)
     */
    static unionScopes(scopes1: string[], scopes2: string[]): string[];
    /**
     * 计算scope数组的差集（scopes1中有但scopes2中没有的）
     * (Calculates difference of scope arrays - scopes in scopes1 but not in scopes2)
     *
     * @param scopes1 - 第一个scope数组 (First scope array)
     * @param scopes2 - 第二个scope数组 (Second scope array)
     * @returns 差集scope数组 (Difference scope array)
     */
    static differenceScopes(scopes1: string[], scopes2: string[]): string[];
}
//# sourceMappingURL=scope-utils.d.ts.map