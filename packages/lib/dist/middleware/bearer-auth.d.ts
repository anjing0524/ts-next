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
 * 包装一个 API 路由处理器，为其添加 Bearer Token 认证和权限检查。
 * Wraps an API route handler to add Bearer Token authentication and permission checks.
 * 支持 Next.js 动态路由 (Dynamic Routes)。
 * Supports Next.js Dynamic Routes.
 *
 * @param handler - 要包装的 API 处理器。它将接收 `request`, `authContext`, 和 `routeContext`。
 *                  The API handler to wrap. It will receive `request`, `authContext`, and `routeContext`.
 * @param options - 认证选项，如 `requiredPermissions`。
 *                  Authentication options, like `requiredPermissions`.
 * @returns 一个新的 API 路由处理器，该处理器会先执行认证，然后调用原始处理器。
 *          A new API route handler that first performs authentication and then calls the original handler.
 */
export declare function withAuth<T extends {
    params?: any;
}>(handler: (request: NextRequest, context: {
    authContext: AuthContext;
    params: T['params'];
}) => Promise<NextResponse>, options?: AuthOptions): (request: NextRequest, routeContext?: T) => Promise<NextResponse>;
/**
 * 权限检查中间件
 * Permission check middleware
 *
 * @param requiredPermission - 必需的权限
 * @returns 权限检查中间件函数
 */
export declare function requirePermission(requiredPermission: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=bearer-auth.d.ts.map