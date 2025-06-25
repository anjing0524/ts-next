import { NextRequest, NextResponse } from 'next/server';
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
export declare function validateRequest(request: NextRequest, options?: ValidationOptions): Promise<ValidationResult>;
/**
 * OAuth重定向URI验证函数
 * OAuth redirect URI validation function
 *
 * @param redirectUri - 重定向URI
 * @param registeredUris - 注册的URI列表
 * @returns 验证结果
 */
export declare function validateRedirectUri(redirectUri: string, registeredUris: string[]): {
    valid: boolean;
    response?: NextResponse;
};
/**
 * OAuth PKCE验证函数
 * OAuth PKCE validation function
 *
 * @param codeChallenge - 代码挑战
 * @param codeChallengeMethod - 代码挑战方法
 * @param required - 是否必需
 * @returns 验证结果
 */
export declare function validatePKCE(codeChallenge?: string, codeChallengeMethod?: string, required?: boolean): {
    valid: boolean;
    response?: NextResponse;
    pkceData?: {
        codeChallenge: string;
        codeChallengeMethod: string;
    };
};
/**
 * 基础验证中间件包装器
 * Basic validation middleware wrapper
 *
 * @param handler - 处理函数
 * @param options - 验证选项
 * @returns 包装后的中间件函数
 */
export declare function withValidation(handler: (request: NextRequest, context: ValidationResult['context']) => Promise<NextResponse>, options?: ValidationOptions): (request: NextRequest) => Promise<NextResponse>;
//# sourceMappingURL=validation.d.ts.map