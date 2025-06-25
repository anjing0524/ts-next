/**
 * PKCE (Proof Key for Code Exchange) 通用工具类
 * PKCE (Proof Key for Code Exchange) Universal Utility Class
 * 
 * 实现 RFC 7636 规范，用于增强 OAuth 2.0 公共客户端安全性
 * Implements RFC 7636 specification for enhancing OAuth 2.0 public client security
 * 
 * @author OAuth团队
 * @since 2.0.0
 */

import crypto from 'crypto';

/**
 * PKCE验证结果接口
 * PKCE validation result interface
 */
export interface PKCEValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * PKCE参数接口
 * PKCE parameters interface
 */
export interface PKCEParams {
  codeVerifier?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

// ===== 函数实现区域 (Function implementations) =====

/**
 * 生成一个符合 RFC 7636 规范的随机 code_verifier
 * (Generates a random code_verifier compliant with RFC 7636)
 * 
 * @returns 返回一个 Base64URL 编码的随机字符串，长度为43-128个字符
 * (Returns a Base64URL encoded random string, 43-128 characters long)
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * 根据给定的 code_verifier 生成 code_challenge (使用 S256 方法)
 * (Generates code_challenge from given code_verifier using S256 method)
 * 
 * @param verifier - 客户端生成的 code_verifier (Client-generated code_verifier)
 * @returns 返回计算得到的 code_challenge (Base64URL 编码) (Returns calculated code_challenge (Base64URL encoded))
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配
 * (Verifies if provided code_verifier matches expected code_challenge)
 * 
 * @param verifier - 客户端在令牌请求中提供的 code_verifier (code_verifier provided by client in token request)
 * @param challenge - 授权服务器存储的 code_challenge (code_challenge stored by authorization server)
 * @param method - 生成 code_challenge 时使用的方法，默认为 'S256' (Method used to generate code_challenge, defaults to 'S256')
 * @returns 如果验证成功则返回 true，否则返回 false (Returns true if verification succeeds, false otherwise)
 */
export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: string = 'S256'
): boolean {
  if (method !== 'S256') {
    console.warn(`PKCEUtils: Unsupported code_challenge_method: ${method}`);
    return false;
  }
  const calculatedChallenge = generateCodeChallenge(verifier);
  return calculatedChallenge === challenge;
}

/**
 * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_challenge string format complies with RFC 7636)
 * 
 * @param challenge - 要验证的 code_challenge 字符串 (code_challenge string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
export function validateCodeChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
}

/**
 * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_verifier string format complies with RFC 7636)
 * 
 * @param verifier - 要验证的 code_verifier 字符串 (code_verifier string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
export function validateCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

/**
 * 检查是否支持指定的 code_challenge_method
 * (Checks if specified code_challenge_method is supported)
 * 
 * @param method - 要检查的方法 (Method to check)
 * @returns 如果支持则返回 true (Returns true if supported)
 */
export function isSupportedChallengeMethod(method: string): boolean {
  return method === 'S256' || method === 'plain';
}

/**
 * 全面验证PKCE参数
 * (Comprehensive PKCE parameters validation)
 * 
 * @param params - PKCE参数 (PKCE parameters)
 * @returns 验证结果 (Validation result)
 */
export function validatePKCEParams(params: PKCEParams): PKCEValidationResult {
  const { codeVerifier, codeChallenge, codeChallengeMethod } = params;
  
  // 在授权请求阶段，需要code_challenge和code_challenge_method
  // For authorization request, code_challenge and code_challenge_method are required
  if (codeChallenge && !codeChallengeMethod) {
    return {
      isValid: false,
      error: 'code_challenge_method is required when code_challenge is provided',
    };
  }
  
  // 验证code_challenge_method
  // Validate code_challenge_method
  if (codeChallengeMethod && !isSupportedChallengeMethod(codeChallengeMethod)) {
    return {
      isValid: false,
      error: `Unsupported code_challenge_method: ${codeChallengeMethod}`,
    };
  }
  
  // 在令牌交换阶段，需要code_verifier
  // For token exchange, code_verifier is required
  if (codeVerifier && !validateCodeVerifier(codeVerifier)) {
    return {
      isValid: false,
      error: 'Invalid code_verifier format',
    };
  }
  
  // 如果提供了完整的PKCE参数，验证匹配性
  // If complete PKCE parameters provided, verify matching
  if (codeVerifier && codeChallenge && codeChallengeMethod) {
    const isMatch = verifyCodeChallenge(codeVerifier, codeChallenge, codeChallengeMethod);
    
    if (!isMatch) {
      return {
        isValid: false,
        error: 'code_verifier does not match code_challenge',
      };
    }
  }
  
  return { isValid: true };
}

/**
 * 生成完整的PKCE参数对
 * (Generates complete PKCE parameter pair)
 * 
 * @returns 包含 code_verifier 和 code_challenge 的对象 (Object containing code_verifier and code_challenge)
 */
export function generatePKCEPair(): { codeVerifier: string; codeChallenge: string; codeChallengeMethod: string } {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// ===== 兼容旧调用：导出同名对象 =====
/**
 * 为了兼容旧代码中 PKCEUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export const PKCEUtils = {
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  validateCodeChallenge,
  validateCodeVerifier,
  isSupportedChallengeMethod,
  validatePKCEParams,
  generatePKCEPair,
} as const; 