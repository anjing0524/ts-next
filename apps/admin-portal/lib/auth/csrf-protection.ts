import { EnhancedTokenStorage } from './enhanced-token-storage';

export interface CSRFConfig {
  allowedMethods: string[];
  tokenHeader: string;
  tokenFormField: string;
  cookieName: string;
  maxAge: number;
  allowedOrigins: string[];
  doubleSubmit: boolean;
}

export class CSRFProtection {
  private static config: CSRFConfig = {
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    tokenHeader: 'X-CSRF-Token',
    tokenFormField: 'csrfToken',
    cookieName: 'csrf_token',
    maxAge: 3600, // 1 hour
    allowedOrigins: [],
    doubleSubmit: true,
  };

  /**
   * 设置CSRF配置
   */
  static setConfig(config: Partial<CSRFConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  static getConfig(): CSRFConfig {
    return { ...this.config };
  }

  /**
   * 生成CSRF令牌
   */
  static generateToken(): string {
    return EnhancedTokenStorage.generateCSRFToken();
  }

  /**
   * 验证HTTP请求的CSRF令牌
   */
  static validateHTTPRequest(request: Request): boolean {
    try {
      // 跳过安全方法
      if (this.config.allowedMethods.includes(request.method)) {
        return true;
      }

      // 获取CSRF令牌
      const csrfToken = this.extractCSRFToken(request);
      if (!csrfToken) {
        this.logSecurityEvent('Missing CSRF token', request);
        return false;
      }

      // 验证令牌
      if (!EnhancedTokenStorage.validateCSRFToken(csrfToken)) {
        this.logSecurityEvent('Invalid CSRF token', request);
        return false;
      }

      // 双重提交验证
      if (this.config.doubleSubmit) {
        const isValid = this.validateDoubleSubmitCookie(csrfToken);
        if (!isValid) {
          this.logSecurityEvent('Double submit validation failed', request);
          return false;
        }
      }

      // 验证来源
      if (this.config.allowedOrigins.length > 0) {
        const isValid = this.validateOrigin(request, this.config.allowedOrigins);
        if (!isValid) {
          this.logSecurityEvent('Invalid origin', request);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('CSRF validation error:', error);
      return false;
    }
  }

  /**
   * 从请求中提取CSRF令牌
   */
  private static extractCSRFToken(request: Request): string | null {
    // 从请求头获取
    const headerToken = request.headers.get(this.config.tokenHeader);
    if (headerToken) {
      return headerToken;
    }

    // 从URL参数获取（仅用于GET请求）
    const url = new URL(request.url);
    const queryToken = url.searchParams.get(this.config.tokenFormField);
    if (queryToken) {
      return queryToken;
    }

    // 从表单数据获取
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || 
        contentType.includes('multipart/form-data')) {
      return this.extractTokenFromFormData(request);
    }

    // 从JSON请求体获取
    if (contentType.includes('application/json')) {
      return this.extractTokenFromJSON(request);
    }

    return null;
  }

  /**
   * 从表单数据中提取CSRF令牌
   */
  private static async extractTokenFromFormData(request: Request): Promise<string | null> {
    try {
      const formData = await request.clone().formData();
      return formData.get(this.config.tokenFormField) as string || null;
    } catch {
      return null;
    }
  }

  /**
   * 从JSON请求体中提取CSRF令牌
   */
  private static async extractTokenFromJSON(request: Request): Promise<string | null> {
    try {
      const body = await request.clone().json();
      return body[this.config.tokenFormField] || null;
    } catch {
      return null;
    }
  }

  /**
   * 验证双重提交Cookie
   */
  static validateDoubleSubmitCookie(requestToken: string): boolean {
    const cookieToken = EnhancedTokenStorage.getCSRFToken();
    if (!cookieToken) {
      return false;
    }

    return cookieToken === requestToken;
  }

  /**
   * 验证请求来源
   */
  static validateOrigin(request: Request, allowedOrigins: string[]): boolean {
    try {
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');

      // 如果有Origin头，验证它
      if (origin) {
        return this.isValidOrigin(origin, allowedOrigins);
      }

      // 如果有Referer头，验证它
      if (referer) {
        const refererUrl = new URL(referer);
        return this.isValidOrigin(refererUrl.origin, allowedOrigins);
      }

      // 没有Origin或Referer的请求通常是直接请求，允许通过
      // 但在严格模式下应该拒绝
      return allowedOrigins.length === 0;
    } catch (error) {
      console.error('Origin validation error:', error);
      return false;
    }
  }

  /**
   * 验证来源是否合法
   */
  private static isValidOrigin(origin: string, allowedOrigins: string[]): boolean {
    return allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      
      // 支持通配符
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace('*', '.*'));
        return regex.test(origin);
      }
      
      return false;
    });
  }

  /**
   * 创建CSRF保护的响应
   */
  static createProtectedResponse(response: Response, request: Request): Response {
    // 为GET请求生成新的CSRF令牌
    if (request.method === 'GET') {
      const token = this.generateToken();
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      // 设置CSRF Cookie
      const cookieValue = `${this.config.cookieName}=${token}; Max-Age=${this.config.maxAge}; Path=/`;
      if (process.env.NODE_ENV === 'production') {
        cookieValue += '; Secure; SameSite=Lax';
      } else {
        cookieValue += '; SameSite=Lax';
      }

      newResponse.headers.set('Set-Cookie', cookieValue);
      return newResponse;
    }

    return response;
  }

  /**
   * 创建CSRF错误响应
   */
  static createCSRFErrorResponse(): Response {
    return new Response(
      JSON.stringify({
        error: 'CSRF validation failed',
        message: 'The request could not be completed due to a CSRF token validation failure.',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Error': 'true',
        },
      }
    );
  }

  /**
   * 获取默认配置
   */
  static getDefaultConfig(): CSRFConfig {
    return {
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      tokenHeader: 'X-CSRF-Token',
      tokenFormField: 'csrfToken',
      cookieName: 'csrf_token',
      maxAge: 3600,
      allowedOrigins: [
        'https://admin-portal.vercel.app',
        'http://localhost:3002',
        'https://localhost:3002',
      ],
      doubleSubmit: true,
    };
  }

  /**
   * 安全事件日志
   */
  private static logSecurityEvent(event: string, request: Request): void {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

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
   * 获取当前请求的安全上下文
   */
  static getSecurityContext(request: Request): {
    hasValidToken: boolean;
    origin: string | null;
    method: string;
    isSafeMethod: boolean;
  } {
    const token = this.extractCSRFToken(request);
    const origin = request.headers.get('origin') || request.headers.get('referer');
    const method = request.method;
    const isSafeMethod = this.config.allowedMethods.includes(method);
    
    return {
      hasValidToken: token ? EnhancedTokenStorage.validateCSRFToken(token) : false,
      origin,
      method,
      isSafeMethod,
    };
  }

  /**
   * 重置配置到默认值
   */
  static resetConfig(): void {
    this.config = this.getDefaultConfig();
  }

  /**
   * 验证请求是否为同源请求
   */
  static isSameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return false;

    const requestUrl = new URL(request.url);
    return origin === `${requestUrl.protocol}//${requestUrl.host}`;
  }

  /**
   * 创建CSRF令牌元数据
   */
  static createTokenMetadata(): {
    token: string;
    expiresAt: number;
    issuedAt: number;
  } {
    const token = this.generateToken();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (this.config.maxAge * 1000);

    return {
      token,
      issuedAt,
      expiresAt,
    };
  }
}