import type { OAuthClient } from '@prisma/client';
/**
 * 将以空格分隔的 scope 字符串解析为字符串数组
 * (Parses a space-separated scope string into an array of strings)
 */
export declare function parseScopes(scopeString?: string): string[];
/**
 * 将 scope 字符串数组格式化为以空格分隔的单个字符串
 * (Formats an array of scope strings into a single space-separated string)
 */
export declare function formatScopes(scopes: string[]): string;
/**
 * 检查用户权限范围是否包含指定的权限
 * (Checks if user scopes contain a specific scope)
 */
export declare function hasScope(userScopes: string[], requiredScope: string): boolean;
/**
 * 检查用户权限范围是否包含任意一个指定的权限
 * (Checks if user scopes contain any of the specified scopes)
 */
export declare function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean;
/**
 * 检查用户权限范围是否包含所有指定的权限
 * (Checks if user scopes contain all specified scopes)
 */
export declare function hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean;
/**
 * 验证scope字符串格式是否合法
 * (Validates if scope string format is valid)
 */
export declare function isValidScopeFormat(scope: string): boolean;
/**
 * 验证scope数组中的所有scope格式是否合法
 * (Validates if all scopes in array have valid format)
 */
export declare function validateScopeFormats(scopes: string[]): {
    valid: boolean;
    invalidScopes: string[];
};
/**
 * 重载签名
 */
export declare function validateScopes(requestedScopes: string[], allowedScopes: string[]): {
    valid: boolean;
    invalidScopes: string[];
    error_description?: string;
};
export declare function validateScopes(requestedScopes: string[], client: OAuthClient): Promise<{
    valid: boolean;
    invalidScopes: string[];
    error_description?: string;
}>;
/**
 * 过滤出有效的权限范围
 * (Filters out valid scopes)
 */
export declare function filterValidScopes(requestedScopes: string[], allowedScopes: string[]): string[];
/**
 * 判断是否是 OpenID Connect 相关的scope
 * (Checks if it's an OpenID Connect related scope)
 */
export declare function isOpenIdConnectScope(scope: string): boolean;
/**
 * 从scope数组中提取所有OIDC相关的scope
 * (Extracts all OIDC related scopes from a scope array)
 */
export declare function extractOpenIdConnectScopes(scopes: string[]): string[];
/**
 * 从scope数组中提取所有非OIDC的自定义scope
 * (Extracts all non-OIDC custom scopes from a scope array)
 */
export declare function extractCustomScopes(scopes: string[]): string[];
/**
 * 判断授权请求是否包含OIDC的scope
 * (Checks if authorization request includes OIDC scopes)
 */
export declare function isOpenIdConnectRequest(scopes: string[]): boolean;
/**
 * 规范化scopes，去除重复并排序
 * (Normalizes scopes, removes duplicates and sorts)
 */
export declare function normalizeScopes(scopes: string[]): string[];
/**
 * 计算两个scope数组的交集
 * (Calculates intersection of two scope arrays)
 */
export declare function intersectScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 计算两个scope数组的并集
 * (Calculates union of two scope arrays)
 */
export declare function unionScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 计算两个scope数组的差集 (scopes1 - scopes2)
 * (Calculates difference of two scope arrays (scopes1 - scopes2))
 */
export declare function differenceScopes(scopes1: string[], scopes2: string[]): string[];
/**
 * 为了兼容旧代码中 ScopeUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export declare const ScopeUtils: {
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
//# sourceMappingURL=scope-utils.d.ts.map