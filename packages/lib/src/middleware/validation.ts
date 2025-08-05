// 文件路径: lib/middleware/validation.ts
// File path: lib/middleware/validation.ts
// 描述: 基础验证中间件 (通用)
// Description: Basic validation middleware (common)

import { NextRequest, NextResponse } from 'next/server';
import { PKCEUtils } from '../auth';
import { RateLimitUtils } from '../utils';

/**
 * 基础验证选项接口
 * Basic validation options interface
 */
export interface ValidationOptions {
  /** 速率限制配置 (Rate limit configuration) */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
    keyType: 'ip' | 'client';
  };
  /** 是否验证请求体格式 (Validate form data format) */
  validateFormData?: boolean;
  /** 必需的请求参数 (Required request parameters) */
  requiredParams?: string[];
  /** 可选的请求参数验证规则 (Optional parameter validation rules) */
  paramValidation?: Record<string, (value: string) => boolean>;
}

/**
 * 验证结果接口
 * Validation result interface
 */
export interface ValidationResult {
  success: boolean;
  response?: NextResponse;
  context?: {
    body?: FormData;
    ipAddress?: string;
    userAgent?: string;
    params?: Record<string, string>;
  };
}

/**
 * 基础请求验证函数
 * Basic request validation function
 *
 * @param request - Next.js请求对象
 * @param options - 验证选项
 * @returns 验证结果
 */
export async function validateRequest(
  request: NextRequest,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  // 速率限制检查 (Rate limit check)
  if (options.rateLimit) {
    const { maxRequests, windowMs, keyType } = options.rateLimit;
    const config = { maxRequests, windowMs, keyType };

    const rateLimitResult = RateLimitUtils.applyRateLimit(request, config);
    const isLimited = !rateLimitResult.allowed;
    if (isLimited) {
      console.warn('Rate limit exceeded');

      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'temporarily_unavailable',
            error_description: 'Rate limit exceeded',
          },
          { status: 429 }
        ),
      };
    }
  }

  let body: FormData | undefined;
  const params: Record<string, string> = {};

  // 解析请求体 (Parse request body)
  if (options.validateFormData) {
    try {
      body = await request.formData();
    } catch {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'invalid_request',
            error_description:
              'Failed to parse request body. Ensure it is application/x-www-form-urlencoded.',
          },
          { status: 400 }
        ),
      };
    }
  }

  // 提取参数（从query string或form data）
  // Extract parameters (from query string or form data)
  if (options.requiredParams || options.paramValidation) {
    const { searchParams } = new URL(request.url);

    // 从query parameters提取 (Extract from query parameters)
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    // 从form data提取（如果存在）(Extract from form data if exists)
    if (body) {
      for (const [key, value] of body.entries()) {
        params[key] = value as string;
      }
    }
  }

  // 验证必需参数 (Validate required parameters)
  if (options.requiredParams) {
    const missingParams = options.requiredParams.filter((param) => !params[param]);

    if (missingParams.length > 0) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'invalid_request',
            error_description: `Missing required parameters: ${missingParams.join(', ')}`,
          },
          { status: 400 }
        ),
      };
    }
  }

  // 自定义参数验证 (Custom parameter validation)
  if (options.paramValidation) {
    for (const [param, validator] of Object.entries(options.paramValidation)) {
      const value = params[param];
      if (value && !validator(value)) {
        return {
          success: false,
          response: NextResponse.json(
            {
              error: 'invalid_request',
              error_description: `Invalid parameter: ${param}`,
            },
            { status: 400 }
          ),
        };
      }
    }
  }

  return {
    success: true,
    context: {
      body,
      ipAddress,
      userAgent,
      params,
    },
  };
}

/**
 * OAuth重定向URI验证函数
 * OAuth redirect URI validation function
 *
 * @param redirectUri - 重定向URI
 * @param registeredUris - 注册的URI列表
 * @returns 验证结果
 */
export function validateRedirectUri(
  redirectUri: string,
  registeredUris: string[]
): { valid: boolean; response?: NextResponse } {
  // 基础URL验证
  try {
    new URL(redirectUri);
  } catch {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri format',
        },
        { status: 400 }
      ),
    };
  }

  // 检查是否在注册的URI列表中
  const isValid = registeredUris.some((uri) => {
    if (uri === redirectUri) return true;
    // 支持通配符匹配
    if (uri.endsWith('/*')) {
      const baseUri = uri.slice(0, -2);
      return redirectUri.startsWith(baseUri);
    }
    return false;
  });

  if (!isValid) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri parameter',
        },
        { status: 400 }
      ),
    };
  }

  return { valid: true };
}

/**
 * OAuth PKCE验证函数
 * OAuth PKCE validation function
 *
 * @param codeChallenge - 代码挑战
 * @param codeChallengeMethod - 代码挑战方法
 * @param required - 是否必需
 * @returns 验证结果
 */
export function validatePKCE(
  codeChallenge?: string,
  codeChallengeMethod?: string,
  required = false
): {
  valid: boolean;
  response?: NextResponse;
  pkceData?: { codeChallenge: string; codeChallengeMethod: string };
} {
  // 如果不是必需的且没有提供，则跳过验证
  if (!required && !codeChallenge) {
    return { valid: true };
  }

  // 如果是必需的但没有提供
  if (required && !codeChallenge) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'PKCE code_challenge is required for this client',
        },
        { status: 400 }
      ),
    };
  }

  // 验证代码挑战格式
  if (codeChallenge && !PKCEUtils.validateCodeChallenge(codeChallenge)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid code_challenge format',
        },
        { status: 400 }
      ),
    };
  }

  // 验证代码挑战方法
  const method = codeChallengeMethod || 'plain';
  if (!['plain', 'S256'].includes(method)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Unsupported code_challenge_method',
        },
        { status: 400 }
      ),
    };
  }

  return {
    valid: true,
    pkceData: {
      codeChallenge: codeChallenge!,
      codeChallengeMethod: method,
    },
  };
}

/**
 * 基础验证中间件包装器
 * Basic validation middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - 验证选项
 * @returns 包装后的中间件函数
 */
export function withValidation(
  handler: (request: NextRequest, context: ValidationResult['context']) => Promise<NextResponse>,
  options: ValidationOptions = {}
) {
  return async function validationMiddleware(request: NextRequest): Promise<NextResponse> {
    const validation = await validateRequest(request, options);

    if (!validation.success) {
      return validation.response!;
    }

    return handler(request, validation.context);
  };
}
