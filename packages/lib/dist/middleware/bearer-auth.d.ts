import { NextRequest, NextResponse } from 'next/server';
/**
 * 为 requirePermission 定义请求类型扩展
 * Define request type extension for requirePermission
 * 这允许我们将用户信息附加到 NextRequest
 * This allows attaching user info to NextRequest
 */
export interface AuthenticatedRequest extends NextRequest {
    user?: {
        id: string;
        userId?: string;
        username?: string;
        clientId?: string;
        permissions?: string[];
        [key: string]: any;
    };
}
/**
 * 认证上下文接口
 * Authentication context interface
 */
export interface AuthContext {
    user_id?: string;
    client_id: string;
    scopes: string[];
    permissions: string[];
    tokenPayload: Record<string, unknown>;
    user?: {
        id: string;
        username?: string;
        email?: string;
        [key: string]: any;
    };
}
/**
 * 认证选项接口
 * Authentication options interface
 */
export interface AuthOptions {
    requiredScopes?: string[];
    requiredPermissions?: string[];
    allowPublicAccess?: boolean;
    requireUserContext?: boolean;
}
/**
 * OAuth 2.0 Bearer Token 认证中间件
 * OAuth 2.0 Bearer Token Authentication Middleware
 *
 * @param request - Next.js请求对象
 * @param options - 认证选项
 * @returns 认证结果，包含成功状态、上下文和可能的响应
 */
export declare function authenticateBearer(request: NextRequest, options?: AuthOptions): Promise<{
    success: boolean;
    context?: AuthContext;
    response?: NextResponse;
}>;
/**
 * 认证中间件包装器
 * Authentication middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - 认证选项
 * @returns 包装后的中间件函数
 */
export declare function withAuth(handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>, options?: AuthOptions): (request: NextRequest) => Promise<NextResponse>;
/**
 * 权限检查中间件
 * Permission check middleware
 *
 * @param requiredPermission - 必需的权限
 * @returns 权限检查中间件函数
 */
export declare function requirePermission(requiredPermission: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=bearer-auth.d.ts.map