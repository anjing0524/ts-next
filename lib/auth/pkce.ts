/**
 * PKCE (Proof Key for Code Exchange) 工具函数
 * 符合 RFC 7636 规范，OAuth2.1 强制要求
 * @author 认证团队
 * @since 1.0.0
 */

import { createHash, randomBytes } from 'crypto';

/**
 * 生成符合RFC 7636规范的code_verifier
 * code_verifier = high-entropy cryptographic random STRING using the
 * unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * with a minimum length of 43 characters and a maximum length of 128 characters.
 */
export function generateCodeVerifier(): string {
  // 生成32字节的随机数据
  const buffer = randomBytes(32);
  
  // 使用base64url编码，确保符合unreserved字符要求
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 根据code_verifier生成code_challenge
 * 支持 "plain" 和 "S256" 两种方法，但OAuth2.1推荐使用S256
 * 
 * @param codeVerifier - 代码验证器
 * @param method - 挑战方法 ("plain" | "S256")
 * @returns code_challenge
 */
export function generateCodeChallenge(
  codeVerifier: string, 
  method: 'plain' | 'S256' = 'S256'
): string {
  if (method === 'plain') {
    // OAuth2.1不推荐使用plain方法，但为了兼容性保留
    return codeVerifier;
  }
  
  if (method === 'S256') {
    // code_challenge = BASE64URL(SHA256(code_verifier))
    const hash = createHash('sha256').update(codeVerifier).digest();
    return hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  throw new Error(`Unsupported code challenge method: ${method}`);
}

/**
 * 验证code_verifier和code_challenge是否匹配
 * 
 * @param codeVerifier - 客户端提供的代码验证器
 * @param codeChallenge - 之前存储的代码挑战
 * @param method - 挑战方法
 * @returns 是否匹配
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: 'plain' | 'S256' = 'S256'
): boolean {
  try {
    const expectedChallenge = generateCodeChallenge(codeVerifier, method);
    return expectedChallenge === codeChallenge;
  } catch (error) {
    return false;
  }
}

/**
 * 验证code_verifier格式是否符合RFC 7636规范
 * 
 * @param codeVerifier - 代码验证器
 * @returns 是否符合规范
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  // 检查长度：43-128字符
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }
  
  // 检查字符：只允许 [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(codeVerifier);
}

/**
 * 验证code_challenge_method是否受支持
 * OAuth2.1推荐使用S256，但为了兼容性也支持plain
 * 
 * @param method - 挑战方法
 * @returns 是否受支持
 */
export function isSupportedChallengeMethod(method: string): method is 'plain' | 'S256' {
  return method === 'plain' || method === 'S256';
}

/**
 * PKCE参数验证结果
 */
export interface PKCEValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * 全面验证PKCE参数
 * 
 * @param params - PKCE参数
 * @returns 验证结果
 */
export function validatePKCEParams(params: {
  codeVerifier?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): PKCEValidationResult {
  const { codeVerifier, codeChallenge, codeChallengeMethod } = params;
  
  // 在授权请求阶段，需要code_challenge和code_challenge_method
  if (codeChallenge && !codeChallengeMethod) {
    return {
      isValid: false,
      error: 'code_challenge_method is required when code_challenge is provided',
    };
  }
  
  // 验证code_challenge_method
  if (codeChallengeMethod && !isSupportedChallengeMethod(codeChallengeMethod)) {
    return {
      isValid: false,
      error: `Unsupported code_challenge_method: ${codeChallengeMethod}`,
    };
  }
  
  // 在令牌交换阶段，需要code_verifier
  if (codeVerifier && !isValidCodeVerifier(codeVerifier)) {
    return {
      isValid: false,
      error: 'Invalid code_verifier format',
    };
  }
  
  // 如果提供了完整的PKCE参数，验证匹配性
  if (codeVerifier && codeChallenge && codeChallengeMethod) {
    const isMatch = verifyCodeChallenge(
      codeVerifier, 
      codeChallenge, 
      codeChallengeMethod as 'plain' | 'S256'
    );
    
    if (!isMatch) {
      return {
        isValid: false,
        error: 'code_verifier does not match code_challenge',
      };
    }
  }
  
  return { isValid: true };
} 