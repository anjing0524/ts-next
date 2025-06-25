/**
 * 授权工具类 - 提供OAuth2授权相关的功能
 * Authorization utility class - provides OAuth2 authorization related functions
 */
export declare class AuthorizationUtils {
    /**
     * 验证提供的redirect_uri是否在客户端注册的redirect_uris列表中
     * Validates if the provided redirect_uri is in the client's list of registered redirect_uris
     *
     * @param redirectUri - 要验证的重定向URI (Redirect URI to validate)
     * @param registeredUris - 客户端注册的URI列表 (List of registered URIs for the client)
     * @returns 是否有效 (Whether it's valid)
     */
    static validateRedirectUri(redirectUri: string, registeredUris: string[]): boolean;
    /**
     * 验证response_type是否是服务器支持的类型
     * Validates if the response_type is supported by the server
     *
     * @param responseType - 响应类型 (Response type)
     * @param supportedTypes - 支持的类型列表 (List of supported types)
     * @returns 是否支持 (Whether it's supported)
     */
    static validateResponseType(responseType: string, supportedTypes?: string[]): boolean;
    /**
     * 生成一个随机的state参数值
     * Generates a random state parameter value
     *
     * @returns 随机state值 (Random state value)
     */
    static generateState(): string;
    /**
     * 生成一个随机的nonce参数值（主要用于OpenID Connect）
     * Generates a random nonce parameter value (mainly for OpenID Connect)
     *
     * @returns 随机nonce值 (Random nonce value)
     */
    static generateNonce(): string;
    /**
     * 生成一个安全的随机授权码
     * Generates a secure random Authorization Code
     *
     * @returns 授权码 (Authorization code)
     */
    static generateAuthorizationCode(): string;
    /**
     * 记录审计事件到数据库
     * Logs an audit event to the database
     *
     * @param event - 审计事件信息 (Audit event information)
     */
    static logAuditEvent(event: {
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
    /**
     * 构建审计日志的details JSON字段
     * Builds the details JSON field for audit logs
     *
     * @param event - 事件信息 (Event information)
     * @returns JSON字符串或null (JSON string or null)
     */
    private static buildDetailsJson;
    /**
     * 获取用户权限
     * Gets user permissions
     *
     * @param userId - 用户ID (User ID)
     * @returns 权限列表 (List of permissions)
     */
    static getUserPermissions(userId: string): Promise<string[]>;
}
//# sourceMappingURL=authorization-utils.d.ts.map