import { NextRequest, NextResponse } from 'next/server';
import { EnhancedTokenStorage } from './enhanced-token-storage';
import { CSRFProtection } from './csrf-protection';

interface SecurityMiddlewareOptions {
  skipCSRF?: boolean;
  skipTokenValidation?: boolean;
  customHeaders?: Record<string, string>;
  customCSP?: string;
  allowedOrigins?: string[];
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class SecurityMiddleware {
  private static rateLimits = new Map<string, RateLimitEntry>();
  private static readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  private static readonly RATE_LIMIT_MAX_REQUESTS = 100;

  /**
   * 安全中间件主函数
   */
  static async middleware(
    request: NextRequest,
    options: SecurityMiddlewareOptions = {}
  ): Promise<NextResponse> {
    try {
      let response = NextResponse.next();

      // 设置安全头部
      response = this.setSecurityHeaders(response, options);

      // 跳过API路由的某些检查
      if (request.nextUrl.pathname?.startsWith('/api/auth')) {
        return response;
      }

      // 速率限制
      const rateLimitResult = this.checkRateLimit(request);
      if (!rateLimitResult.allowed) {
        return this.createRateLimitResponse(rateLimitResult.retryAfter || 60);
      }

      // 令牌验证
      if (!options.skipTokenValidation) {
        const tokenValidation = await this.validateTokens(request);
        if (!tokenValidation.valid) {
          return this.createTokenErrorResponse(tokenValidation.reason || 'Invalid token');
        }
      }

      // CSRF保护
      if (!options.skipCSRF && request.method !== 'GET' && request.method !== 'HEAD') {
        const csrfValid = CSRFProtection.validateHTTPRequest(request);
        if (!csrfValid) {
          this.logSecurityEvent('CSRF validation failed', request);
          return this.createCSRFErrorResponse();
        }
      }

      // 来源验证
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const originValid = this.validateOrigin(request, options.allowedOrigins);
        if (!originValid) {
          this.logSecurityEvent('Invalid origin', request);
          return this.createOriginErrorResponse();
        }
      }

      return response;
    } catch (error) {
      console.error('Security middleware error:', error);
      return NextResponse.json(
        { error: 'Security check failed' },
        { status: 500 }
      );
    }
  }

  /**
   * 设置安全头部
   */
  private static setSecurityHeaders(
    response: NextResponse,
    options: SecurityMiddlewareOptions
  ): NextResponse {
    const headers = response.headers;

    // 基本安全头部
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // 自定义头部
    if (options.customHeaders) {
      Object.entries(options.customHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    // 内容安全策略
    // const csp = this.generateCSP('', options.customCSP);
    // headers.set('Content-Security-Policy', csp);

    // 严格传输安全（生产环境）
    if (process.env.NODE_ENV === 'production') {
      headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    return response;
  }

  /**
   * 生成内容安全策略
   */
  private static generateCSP(url: string, customCSP?: string): string {
    if (customCSP) return customCSP;

    const isApi = url.includes('/api/');

    if (isApi) {
      return "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    }

    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
  }

  /**
   * 检查速率限制
   */
  private static checkRateLimit(request: NextRequest): {
    allowed: boolean;
    retryAfter?: number;
  } {
    const clientIP = this.getClientIP(request);
    const now = Date.now();

    let entry = this.rateLimits.get(clientIP);
    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW };
      this.rateLimits.set(clientIP, entry);
      return { allowed: true };
    }

    if (entry.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    entry.count++;
    return { allowed: true };
  }

  /**
   * 获取客户端IP
   */
  private static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    return forwarded?.split(',')[0]?.trim() || realIP || 'unknown';
  }

  /**
   * 验证令牌
   */
  private static async validateTokens(request: NextRequest): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    const accessToken = request.cookies.get('access_token')?.value;

    if (!accessToken) {
      return { valid: false, reason: 'No access token' };
    }

    // 这里可以添加JWT验证逻辑
    try {
      // 模拟JWT验证
      const payload = this.parseJWT(accessToken);
      if (!payload) {
        return { valid: false, reason: 'Invalid token format' };
      }

      // 检查过期时间
      if (payload.exp < Date.now() / 1000) {
        return { valid: false, reason: 'Token expired' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Token validation failed' };
    }
  }

  /**
   * 解析JWT令牌（简化版）
   */
  private static parseJWT(token: string): any {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;

      const decoded = Buffer.from(payload, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * 验证来源
   */
  private static validateOrigin(
    request: NextRequest,
    allowedOrigins?: string[]
  ): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return true; // 允许没有来源的请求

    const defaultOrigins = [
      'https://admin-portal.vercel.app',
      'http://localhost:3002',
      'https://localhost:3002',
    ];

    const allowed = allowedOrigins || defaultOrigins;
    return allowed.some(allowedOrigin => {
      if (allowedOrigin === origin) return true;

      // 支持通配符
      if (allowedOrigin.includes('*')) {
        const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
        return regex.test(origin);
      }

      return false;
    });
  }

  /**
   * 创建速率限制响应
   */
  private static createRateLimitResponse(retryAfter: number): NextResponse {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': this.RATE_LIMIT_MAX_REQUESTS.toString(),
          'X-RateLimit-Window': (this.RATE_LIMIT_WINDOW / 1000).toString(),
        },
      }
    );
  }

  /**
   * 创建令牌错误响应
   */
  private static createTokenErrorResponse(reason: string): NextResponse {
    return NextResponse.json(
      { error: 'Authentication required', reason },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer error="${reason}"`,
        },
      }
    );
  }

  /**
   * 创建CSRF错误响应
   */
  private static createCSRFErrorResponse(): NextResponse {
    return NextResponse.json(
      {
        error: 'CSRF validation failed',
        message: 'The request could not be completed due to a CSRF token validation failure',
      },
      {
        status: 403,
        headers: {
          'X-CSRF-Error': 'true',
        },
      }
    );
  }

  /**
   * 创建来源错误响应
   */
  private static createOriginErrorResponse(): NextResponse {
    return NextResponse.json(
      {
        error: 'Origin validation failed',
        message: 'The request origin is not allowed',
      },
      {
        status: 403,
        headers: {
          'X-Origin-Error': 'true',
        },
      }
    );
  }

  /**
   * 安全事件日志
   */
  private static logSecurityEvent(event: string, request: NextRequest): void {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = this.getClientIP(request);

    console.warn(`Security event: ${event}`, {
      method: request.method,
      path: url.pathname,
      origin,
      userAgent,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 清理过期的速率限制记录
   */
  static cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimits.entries()) {
      if (now > entry.resetTime) {
        this.rateLimits.delete(key);
      }
    }
  }

  /**
   * 获取速率限制统计
   */
  static getRateLimitStats(): {
    totalEntries: number;
    activeClients: number;
  } {
    this.cleanupRateLimits();
    return {
      totalEntries: this.rateLimits.size,
      activeClients: this.rateLimits.size,
    };
  }

  /**
   * 重置速率限制
   */
  static resetRateLimits(): void {
    this.rateLimits.clear();
  }
}

/**
 * Next.js中间件兼容性包装器
 */
export async function securityMiddleware(
  request: NextRequest,
  options?: SecurityMiddlewareOptions
): Promise<NextResponse<unknown>> {
  return SecurityMiddleware.middleware(request, options);
}

/**
 * 获取安全中间件配置
 */
export function getSecurityConfig(): any {
  return {
    rateLimitWindow: SecurityMiddleware['RATE_LIMIT_WINDOW'],
    rateLimitMaxRequests: SecurityMiddleware['RATE_LIMIT_MAX_REQUESTS'],
  };
}