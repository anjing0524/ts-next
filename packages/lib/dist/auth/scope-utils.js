"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeUtils = void 0;
exports.parseScopes = parseScopes;
exports.formatScopes = formatScopes;
exports.hasScope = hasScope;
exports.hasAnyScope = hasAnyScope;
exports.hasAllScopes = hasAllScopes;
exports.isValidScopeFormat = isValidScopeFormat;
exports.validateScopeFormats = validateScopeFormats;
exports.validateScopes = validateScopes;
exports.filterValidScopes = filterValidScopes;
exports.isOpenIdConnectScope = isOpenIdConnectScope;
exports.extractOpenIdConnectScopes = extractOpenIdConnectScopes;
exports.extractCustomScopes = extractCustomScopes;
exports.isOpenIdConnectRequest = isOpenIdConnectRequest;
exports.normalizeScopes = normalizeScopes;
exports.intersectScopes = intersectScopes;
exports.unionScopes = unionScopes;
exports.differenceScopes = differenceScopes;
// ===== 函数实现区域 (Function implementations) =====
/**
 * 将以空格分隔的 scope 字符串解析为字符串数组
 * (Parses a space-separated scope string into an array of strings)
 */
function parseScopes(scopeString) {
    if (!scopeString)
        return [];
    return scopeString.split(' ').filter(s => s.length > 0);
}
/**
 * 将 scope 字符串数组格式化为以空格分隔的单个字符串
 * (Formats an array of scope strings into a single space-separated string)
 */
function formatScopes(scopes) {
    return scopes.join(' ');
}
/**
 * 检查用户权限范围是否包含指定的权限
 * (Checks if user scopes contain a specific scope)
 */
function hasScope(userScopes, requiredScope) {
    return userScopes.includes(requiredScope);
}
/**
 * 检查用户权限范围是否包含任意一个指定的权限
 * (Checks if user scopes contain any of the specified scopes)
 */
function hasAnyScope(userScopes, requiredScopes) {
    return requiredScopes.some(scope => userScopes.includes(scope));
}
/**
 * 检查用户权限范围是否包含所有指定的权限
 * (Checks if user scopes contain all specified scopes)
 */
function hasAllScopes(userScopes, requiredScopes) {
    return requiredScopes.every(scope => userScopes.includes(scope));
}
/**
 * 验证scope字符串格式是否合法
 * (Validates if scope string format is valid)
 */
function isValidScopeFormat(scope) {
    // OAuth 2.0 RFC 规定 scope 应该是可打印的ASCII字符，不包含空格、双引号、反斜杠
    return /^[!-~]+$/.test(scope) && !/[\s"\\]/.test(scope);
}
/**
 * 验证scope数组中的所有scope格式是否合法
 * (Validates if all scopes in array have valid format)
 */
function validateScopeFormats(scopes) {
    const invalidScopes = scopes.filter(scope => !isValidScopeFormat(scope));
    return {
        valid: invalidScopes.length === 0,
        invalidScopes,
    };
}
/**
 * 验证请求的scopes是否有效
 * (Validates if requested scopes are valid)
 */
function validateScopes(requestedScopes, allowedScopesOrClient) {
    if (requestedScopes.length === 0) {
        return { valid: true, invalidScopes: [] };
    }
    // 1. 简单验证: allowedScopesOrClient 是一个字符串数组
    if (Array.isArray(allowedScopesOrClient)) {
        const invalidScopes = requestedScopes.filter(scope => !allowedScopesOrClient.includes(scope));
        return {
            valid: invalidScopes.length === 0,
            invalidScopes,
            error_description: invalidScopes.length > 0
                ? `Requested scope(s) not in allowed list: ${invalidScopes.join(', ')}`
                : undefined,
        };
    }
    const client = allowedScopesOrClient;
    // 2. 高级验证: OAuthClient 对象，需要数据库检查
    if (client.id && client.allowedScopes !== undefined) {
        return (async () => {
            let clientAllowedScopes = [];
            if (client.allowedScopes) {
                try {
                    // Prisma 返回的可能是 string | JsonValue，这里强制为 string
                    clientAllowedScopes = JSON.parse(client.allowedScopes);
                    if (!Array.isArray(clientAllowedScopes))
                        clientAllowedScopes = [];
                }
                catch (e) {
                    console.error('Failed to parse client.allowedScopes for client ID:', client.id, e);
                    clientAllowedScopes = [];
                }
            }
            const invalidAgainstClientAllowed = requestedScopes.filter(scope => !clientAllowedScopes.includes(scope));
            if (invalidAgainstClientAllowed.length > 0) {
                return {
                    valid: false,
                    invalidScopes: invalidAgainstClientAllowed,
                    error_description: `Requested scope(s) not allowed for this client: ${invalidAgainstClientAllowed.join(', ')}`,
                };
            }
            try {
                const { prisma } = await Promise.resolve().then(() => __importStar(require('@repo/database')));
                const validDbScopes = await prisma.scope.findMany({
                    where: {
                        name: { in: requestedScopes },
                        isActive: true,
                    },
                });
                const validDbScopeNames = validDbScopes.map(scope => scope.name);
                const invalidAgainstDb = requestedScopes.filter(scope => !validDbScopeNames.includes(scope));
                return {
                    valid: invalidAgainstDb.length === 0,
                    invalidScopes: invalidAgainstDb,
                    error_description: invalidAgainstDb.length > 0
                        ? `Requested scope(s) not found in system: ${invalidAgainstDb.join(', ')}`
                        : undefined,
                };
            }
            catch (error) {
                console.warn('Database validation not available, falling back to client-only validation');
                return { valid: true, invalidScopes: [] };
            }
        })();
    }
    // 3. 通用对象验证
    return (async () => {
        const clientObj = allowedScopesOrClient;
        let allowedScopes = [];
        const scopeString = clientObj.allowedScopes || clientObj.clientScopes || clientObj.scopes || '';
        try {
            if (scopeString) {
                allowedScopes = typeof scopeString === 'string'
                    ? parseScopes(scopeString)
                    : Array.isArray(scopeString)
                        ? scopeString
                        : [];
            }
        }
        catch (error) {
            console.error('Error parsing client scopes:', error);
            return {
                valid: false,
                invalidScopes: requestedScopes,
                error_description: 'Failed to parse client allowed scopes'
            };
        }
        const invalidScopes = requestedScopes.filter(scope => !allowedScopes.includes(scope));
        return {
            valid: invalidScopes.length === 0,
            invalidScopes,
            error_description: invalidScopes.length > 0
                ? `Requested scope(s) not in allowed list: ${invalidScopes.join(', ')}`
                : undefined,
        };
    })();
}
/**
 * 过滤出有效的权限范围
 * (Filters out valid scopes)
 */
function filterValidScopes(requestedScopes, allowedScopes) {
    return requestedScopes.filter(scope => allowedScopes.includes(scope));
}
/**
 * 判断是否是 OpenID Connect 相关的scope
 * (Checks if it's an OpenID Connect related scope)
 */
function isOpenIdConnectScope(scope) {
    const oidcScopes = ['openid', 'profile', 'email', 'address', 'phone'];
    return oidcScopes.includes(scope);
}
/**
 * 从scope数组中提取所有OIDC相关的scope
 * (Extracts all OIDC related scopes from a scope array)
 */
function extractOpenIdConnectScopes(scopes) {
    return scopes.filter(isOpenIdConnectScope);
}
/**
 * 从scope数组中提取所有非OIDC的自定义scope
 * (Extracts all non-OIDC custom scopes from a scope array)
 */
function extractCustomScopes(scopes) {
    return scopes.filter(scope => !isOpenIdConnectScope(scope));
}
/**
 * 判断授权请求是否包含OIDC的scope
 * (Checks if authorization request includes OIDC scopes)
 */
function isOpenIdConnectRequest(scopes) {
    return scopes.includes('openid');
}
/**
 * 规范化scopes，去除重复并排序
 * (Normalizes scopes, removes duplicates and sorts)
 */
function normalizeScopes(scopes) {
    return [...new Set(scopes)].sort();
}
/**
 * 计算两个scope数组的交集
 * (Calculates intersection of two scope arrays)
 */
function intersectScopes(scopes1, scopes2) {
    const set1 = new Set(scopes1);
    return scopes2.filter(scope => set1.has(scope));
}
/**
 * 计算两个scope数组的并集
 * (Calculates union of two scope arrays)
 */
function unionScopes(scopes1, scopes2) {
    return [...new Set([...scopes1, ...scopes2])];
}
/**
 * 计算两个scope数组的差集 (scopes1 - scopes2)
 * (Calculates difference of two scope arrays (scopes1 - scopes2))
 */
function differenceScopes(scopes1, scopes2) {
    const set2 = new Set(scopes2);
    return scopes1.filter(scope => !set2.has(scope));
}
// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 ScopeUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
exports.ScopeUtils = {
    parseScopes,
    formatScopes,
    hasScope,
    hasAnyScope,
    hasAllScopes,
    isValidScopeFormat,
    validateScopeFormats,
    validateScopes,
    filterValidScopes,
    isOpenIdConnectScope,
    extractOpenIdConnectScopes,
    extractCustomScopes,
    isOpenIdConnectRequest,
    normalizeScopes,
    intersectScopes,
    unionScopes,
    differenceScopes,
};
