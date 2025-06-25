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
/**
 * 生成一个符合 RFC 7636 规范的随机 code_verifier
 * (Generates a random code_verifier compliant with RFC 7636)
 *
 * @returns 返回一个 Base64URL 编码的随机字符串，长度为43-128个字符
 * (Returns a Base64URL encoded random string, 43-128 characters long)
 */
export declare function generateCodeVerifier(): string;
/**
 * 根据给定的 code_verifier 生成 code_challenge (使用 S256 方法)
 * (Generates code_challenge from given code_verifier using S256 method)
 *
 * @param verifier - 客户端生成的 code_verifier (Client-generated code_verifier)
 * @returns 返回计算得到的 code_challenge (Base64URL 编码) (Returns calculated code_challenge (Base64URL encoded))
 */
export declare function generateCodeChallenge(verifier: string): string;
/**
 * 验证提供的 code_verifier 是否与预期的 code_challenge 匹配
 * (Verifies if provided code_verifier matches expected code_challenge)
 *
 * @param verifier - 客户端在令牌请求中提供的 code_verifier (code_verifier provided by client in token request)
 * @param challenge - 授权服务器存储的 code_challenge (code_challenge stored by authorization server)
 * @param method - 生成 code_challenge 时使用的方法，默认为 'S256' (Method used to generate code_challenge, defaults to 'S256')
 * @returns 如果验证成功则返回 true，否则返回 false (Returns true if verification succeeds, false otherwise)
 */
export declare function verifyCodeChallenge(verifier: string, challenge: string, method?: string): boolean;
/**
 * 验证 code_challenge 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_challenge string format complies with RFC 7636)
 *
 * @param challenge - 要验证的 code_challenge 字符串 (code_challenge string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
export declare function validateCodeChallenge(challenge: string): boolean;
/**
 * 验证 code_verifier 字符串的格式是否符合 RFC 7636 规范
 * (Validates if code_verifier string format complies with RFC 7636)
 *
 * @param verifier - 要验证的 code_verifier 字符串 (code_verifier string to validate)
 * @returns 如果格式有效则返回 true，否则返回 false (Returns true if format is valid, false otherwise)
 */
export declare function validateCodeVerifier(verifier: string): boolean;
/**
 * 检查是否支持指定的 code_challenge_method
 * (Checks if specified code_challenge_method is supported)
 *
 * @param method - 要检查的方法 (Method to check)
 * @returns 如果支持则返回 true (Returns true if supported)
 */
export declare function isSupportedChallengeMethod(method: string): boolean;
/**
 * 全面验证PKCE参数
 * (Comprehensive PKCE parameters validation)
 *
 * @param params - PKCE参数 (PKCE parameters)
 * @returns 验证结果 (Validation result)
 */
export declare function validatePKCEParams(params: PKCEParams): PKCEValidationResult;
/**
 * 生成完整的PKCE参数对
 * (Generates complete PKCE parameter pair)
 *
 * @returns 包含 code_verifier 和 code_challenge 的对象 (Object containing code_verifier and code_challenge)
 */
export declare function generatePKCEPair(): {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: string;
};
/**
 * 为了兼容旧代码中 PKCEUtils.method 的调用，
 * 这里导出一个与之前类同名的常量对象。
 */
export declare const PKCEUtils: {
    readonly generateCodeVerifier: typeof generateCodeVerifier;
    readonly generateCodeChallenge: typeof generateCodeChallenge;
    readonly verifyCodeChallenge: typeof verifyCodeChallenge;
    readonly validateCodeChallenge: typeof validateCodeChallenge;
    readonly validateCodeVerifier: typeof validateCodeVerifier;
    readonly isSupportedChallengeMethod: typeof isSupportedChallengeMethod;
    readonly validatePKCEParams: typeof validatePKCEParams;
    readonly generatePKCEPair: typeof generatePKCEPair;
};
//# sourceMappingURL=pkce-utils.d.ts.map