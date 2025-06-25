/**
 * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
 * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
 */
export declare function validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean;
/**
 * 验证response_type是否是服务器支持的类型
 * Validates if the response_type is supported by the server
 */
export declare function validateResponseType(responseType: string, supportedTypes?: string[]): boolean;
/** 生成随机state */
export declare function generateState(): string;
/** 生成随机nonce (主要用于OIDC) */
export declare function generateNonce(): string;
/** 生成安全的授权码 */
export declare function generateAuthorizationCode(): string;
/**
 * 记录审计事件到数据库 (Logs an audit event)
 */
export declare function logAuditEvent(event: {
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
export declare function getUserPermissions(userId: string): Promise<string[]>;
/**
 * 为了兼容旧代码中 AuthorizationUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export declare const AuthorizationUtils: {
    readonly validateRedirectUri: typeof validateRedirectUri;
    readonly validateResponseType: typeof validateResponseType;
    readonly generateState: typeof generateState;
    readonly generateNonce: typeof generateNonce;
    readonly generateAuthorizationCode: typeof generateAuthorizationCode;
    readonly logAuditEvent: typeof logAuditEvent;
    readonly getUserPermissions: typeof getUserPermissions;
};
//# sourceMappingURL=authorization-utils.d.ts.map