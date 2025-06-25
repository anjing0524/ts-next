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
exports.AuthorizationUtils = void 0;
exports.validateRedirectUri = validateRedirectUri;
exports.validateResponseType = validateResponseType;
exports.generateState = generateState;
exports.generateNonce = generateNonce;
exports.generateAuthorizationCode = generateAuthorizationCode;
exports.logAuditEvent = logAuditEvent;
exports.getUserPermissions = getUserPermissions;
const crypto = __importStar(require("crypto"));
const database_1 = require("@repo/database");
const rbac_service_1 = require("../services/rbac-service");
// ===== 函数实现区域 (Function implementations) =====
/**
 * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
 * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
 */
function validateRedirectUri(redirectUri, registeredUris) {
    return registeredUris.includes(redirectUri);
}
/**
 * 验证response_type是否是服务器支持的类型
 * Validates if the response_type is supported by the server
 */
function validateResponseType(responseType, supportedTypes = ['code']) {
    return supportedTypes.includes(responseType);
}
/** 生成随机state */
function generateState() {
    return crypto.randomBytes(32).toString('base64url');
}
/** 生成随机nonce (主要用于OIDC) */
function generateNonce() {
    return crypto.randomBytes(32).toString('base64url');
}
/** 生成安全的授权码 */
function generateAuthorizationCode() {
    return crypto.randomBytes(32).toString('hex');
}
/**
 * 记录审计事件到数据库 (Logs an audit event)
 */
async function logAuditEvent(event) {
    try {
        let actorType = 'SYSTEM';
        let actorId = 'system';
        if (event.userId) {
            actorType = 'USER';
            actorId = event.userId;
        }
        else if (event.clientId) {
            actorType = 'CLIENT';
            const clientForActorId = await database_1.prisma.oAuthClient.findUnique({
                where: { id: event.clientId },
                select: { clientId: true },
            });
            actorId = clientForActorId ? clientForActorId.clientId : event.clientId;
        }
        let success = event.success;
        if (success === undefined) {
            success = event.status ? event.status === 'SUCCESS' : !event.errorMessage;
        }
        await database_1.prisma.auditLog.create({
            data: {
                action: event.action,
                actorType,
                actorId: actorId || 'system',
                status: success ? 'SUCCESS' : 'FAILURE',
                ipAddress: event.ipAddress || null,
                userAgent: event.userAgent || null,
                details: buildDetailsJson(event) || undefined,
            },
        });
    }
    catch (error) {
        console.error('Failed to log audit event:', error);
    }
}
/** 获取用户权限 */
async function getUserPermissions(userId) {
    try {
        const userPermissions = await rbac_service_1.RBACService.getUserPermissions(userId);
        const permissions = (userPermissions === null || userPermissions === void 0 ? void 0 : userPermissions.permissions) || [];
        const permissionsSet = new Set(permissions.filter((p) => typeof p === 'string'));
        return Array.from(permissionsSet);
    }
    catch (error) {
        console.error('Error getting user permissions:', error);
        return [];
    }
}
// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 AuthorizationUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
exports.AuthorizationUtils = {
    validateRedirectUri,
    validateResponseType,
    generateState,
    generateNonce,
    generateAuthorizationCode,
    logAuditEvent,
    getUserPermissions,
};
// ===== 私有辅助函数 =====
function buildDetailsJson(event) {
    let detailsObj = {};
    if (event.metadata) {
        detailsObj = Object.assign(Object.assign({}, detailsObj), event.metadata);
    }
    if (event.errorMessage) {
        detailsObj.errorMessage = event.errorMessage;
    }
    if (event.details) {
        try {
            const parsedDetails = JSON.parse(event.details);
            detailsObj = Object.assign(Object.assign({}, detailsObj), parsedDetails);
        }
        catch (_a) {
            detailsObj.rawDetails = event.details;
        }
    }
    return Object.keys(detailsObj).length > 0 ? JSON.stringify(detailsObj) : null;
}
