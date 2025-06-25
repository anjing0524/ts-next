"use strict";
// 文件路径: lib/auth/middleware/cors.ts
// File path: lib/auth/middleware/cors.ts
// 描述: CORS (跨域资源共享) 中间件
// Description: CORS (Cross-Origin Resource Sharing) Middleware
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCORS = withCORS;
exports.withDefaultCORS = withDefaultCORS;
exports.getCORSOptionsFromEnv = getCORSOptionsFromEnv;
exports.withEnvCORS = withEnvCORS;
const server_1 = require("next/server");
/**
 * 默认CORS配置
 * Default CORS configuration
 */
const DEFAULT_CORS_OPTIONS = {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
    ],
    allowCredentials: true,
    maxAge: 86400, // 24小时 (24 hours)
};
/**
 * 检查源域名是否被允许
 * Check if origin is allowed
 *
 * @param origin - 请求的源域名
 * @param allowedOrigins - 允许的源域名列表
 * @returns 是否允许该源域名
 */
function isOriginAllowed(origin, allowedOrigins) {
    if (!origin)
        return false;
    // 如果配置为允许所有源 (If configured to allow all origins)
    if (allowedOrigins.includes('*'))
        return true;
    // 检查精确匹配 (Check exact match)
    if (allowedOrigins.includes(origin))
        return true;
    // 检查通配符匹配 (Check wildcard match)
    return allowedOrigins.some(allowedOrigin => {
        if (allowedOrigin.includes('*')) {
            const pattern = allowedOrigin.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(origin);
        }
        return false;
    });
}
/**
 * 处理预检请求
 * Handle preflight request
 *
 * @param request - Next.js请求对象
 * @param options - CORS配置选项
 * @returns 预检响应
 */
function handlePreflightRequest(request, options) {
    var _a;
    const origin = request.headers.get('origin');
    const requestMethod = request.headers.get('access-control-request-method');
    const requestHeaders = request.headers.get('access-control-request-headers');
    // 创建预检响应 (Create preflight response)
    const response = new server_1.NextResponse(null, { status: 204 });
    // 设置允许的源 (Set allowed origin)
    if (origin && isOriginAllowed(origin, options.allowedOrigins || DEFAULT_CORS_OPTIONS.allowedOrigins)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    }
    // 设置允许的方法 (Set allowed methods)
    if (requestMethod && ((_a = options.allowedMethods) === null || _a === void 0 ? void 0 : _a.includes(requestMethod))) {
        response.headers.set('Access-Control-Allow-Methods', options.allowedMethods.join(', '));
    }
    // 设置允许的请求头 (Set allowed headers)
    if (requestHeaders) {
        const requestedHeaders = requestHeaders.split(',').map(h => h.trim());
        const allowedHeaders = options.allowedHeaders || DEFAULT_CORS_OPTIONS.allowedHeaders;
        const validHeaders = requestedHeaders.filter(header => allowedHeaders.some(allowed => allowed.toLowerCase() === header.toLowerCase()));
        if (validHeaders.length > 0) {
            response.headers.set('Access-Control-Allow-Headers', validHeaders.join(', '));
        }
    }
    // 设置是否允许凭证 (Set credentials)
    if (options.allowCredentials) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    // 设置缓存时间 (Set cache time)
    if (options.maxAge) {
        response.headers.set('Access-Control-Max-Age', options.maxAge.toString());
    }
    return response;
}
/**
 * 为响应添加CORS头
 * Add CORS headers to response
 *
 * @param response - 响应对象
 * @param request - 请求对象
 * @param options - CORS配置选项
 * @returns 添加了CORS头的响应
 */
function addCORSHeaders(response, request, options) {
    const origin = request.headers.get('origin');
    // 设置允许的源 (Set allowed origin)
    if (origin && isOriginAllowed(origin, options.allowedOrigins || DEFAULT_CORS_OPTIONS.allowedOrigins)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    }
    // 设置允许的方法 (Set allowed methods)
    response.headers.set('Access-Control-Allow-Methods', (options.allowedMethods || DEFAULT_CORS_OPTIONS.allowedMethods).join(', '));
    // 设置允许的请求头 (Set allowed headers)
    response.headers.set('Access-Control-Allow-Headers', (options.allowedHeaders || DEFAULT_CORS_OPTIONS.allowedHeaders).join(', '));
    // 设置是否允许凭证 (Set credentials)
    if (options.allowCredentials) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    // 设置暴露的响应头 (Set exposed headers)
    response.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    return response;
}
/**
 * CORS中间件包装器
 * CORS middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - CORS配置选项
 * @returns 包装后的中间件函数
 */
function withCORS(handler, options = {}) {
    // 合并配置选项 (Merge configuration options)
    const corsOptions = Object.assign(Object.assign({}, DEFAULT_CORS_OPTIONS), options);
    return async function corsMiddleware(request) {
        // 处理预检请求 (Handle preflight request)
        if (request.method === 'OPTIONS') {
            return handlePreflightRequest(request, corsOptions);
        }
        try {
            // 调用原始处理函数 (Call original handler)
            const response = await handler(request);
            // 为响应添加CORS头 (Add CORS headers to response)
            return addCORSHeaders(response, request, corsOptions);
        }
        catch (error) {
            console.error('CORS中间件处理错误 (CORS middleware error):', error);
            // 创建错误响应并添加CORS头 (Create error response with CORS headers)
            const errorResponse = server_1.NextResponse.json({
                success: false,
                message: '服务器内部错误 (Internal server error)',
                error: 'INTERNAL_ERROR',
            }, { status: 500 });
            return addCORSHeaders(errorResponse, request, corsOptions);
        }
    };
}
/**
 * 简化的CORS中间件，使用默认配置
 * Simplified CORS middleware with default configuration
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
function withDefaultCORS(handler) {
    return withCORS(handler, DEFAULT_CORS_OPTIONS);
}
/**
 * 获取环境变量中配置的CORS选项
 * Get CORS options from environment variables
 *
 * @returns CORS配置选项
 */
function getCORSOptionsFromEnv() {
    var _a, _b, _c;
    const allowedOrigins = ((_a = process.env.CORS_ALLOWED_ORIGINS) === null || _a === void 0 ? void 0 : _a.split(',').map(o => o.trim())) || ['*'];
    const allowedMethods = ((_b = process.env.CORS_ALLOWED_METHODS) === null || _b === void 0 ? void 0 : _b.split(',').map(m => m.trim())) ||
        DEFAULT_CORS_OPTIONS.allowedMethods;
    const allowedHeaders = ((_c = process.env.CORS_ALLOWED_HEADERS) === null || _c === void 0 ? void 0 : _c.split(',').map(h => h.trim())) ||
        DEFAULT_CORS_OPTIONS.allowedHeaders;
    const allowCredentials = process.env.CORS_ALLOW_CREDENTIALS === 'true';
    const maxAge = process.env.CORS_MAX_AGE ? parseInt(process.env.CORS_MAX_AGE, 10) :
        DEFAULT_CORS_OPTIONS.maxAge;
    return {
        allowedOrigins,
        allowedMethods,
        allowedHeaders,
        allowCredentials,
        maxAge,
    };
}
/**
 * 环境配置的CORS中间件
 * Environment-configured CORS middleware
 *
 * @param handler - 处理函数
 * @returns 包装后的中间件函数
 */
function withEnvCORS(handler) {
    return withCORS(handler, getCORSOptionsFromEnv());
}
