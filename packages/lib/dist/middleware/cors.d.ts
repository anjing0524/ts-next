import { NextRequest, NextResponse } from 'next/server';
/**
 * CORS中间件配置选项
 * CORS middleware configuration options
 */
export interface CORSOptions {
    /** 允许的源域名 (Allowed origins) */
    allowedOrigins?: string[];
    /** 允许的HTTP方法 (Allowed HTTP methods) */
    allowedMethods?: string[];
    /** 允许的请求头 (Allowed headers) */
    allowedHeaders?: string[];
    /** 是否允许携带凭证 (Allow credentials) */
    allowCredentials?: boolean;
    /** 预检请求缓存时间 (Preflight cache time) */
    maxAge?: number;
}
/**
 * CORS中间件包装器
 * CORS middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - CORS配置选项
 * @returns 包装后的中间件函数
 */
export declare function withCORS(handler: (request: NextRequest) => Promise<NextResponse>, options?: CORSOptions): (request: NextRequest) => Promise<NextResponse>;
/**
 * 简化的CORS中间件，使用默认配置
 * Simplified CORS middleware with default configuration
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export declare function withDefaultCORS(handler: (request: NextRequest) => Promise<NextResponse>): (request: NextRequest) => Promise<NextResponse>;
/**
 * 获取环境变量中配置的CORS选项
 * Get CORS options from environment variables
 *
 * @returns CORS配置选项
 */
export declare function getCORSOptionsFromEnv(): CORSOptions;
/**
 * 环境配置的CORS中间件
 * Environment-configured CORS middleware
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
export declare function withEnvCORS(handler: (request: NextRequest) => Promise<NextResponse>): (request: NextRequest) => Promise<NextResponse>;
//# sourceMappingURL=cors.d.ts.map