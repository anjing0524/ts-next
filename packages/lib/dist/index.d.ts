/**
 * 浏览器兼容的PKCE工具类
 * Browser-compatible PKCE utility class
 *
 * 使用Web Crypto API实现，适用于浏览器环境
 * Uses Web Crypto API, suitable for browser environments
 */
/**
 * 浏览器PKCE工具类
 * Browser PKCE utility class
 */
declare class BrowserPKCEUtils {
    /**
     * 生成PKCE code_verifier
     * Generate PKCE code_verifier
     *
     * RFC 7636 规定 code_verifier 长度应在 43-128 字符之间
     * RFC 7636 specifies code_verifier length should be 43-128 characters
     */
    static generateCodeVerifier(): string;
    /**
     * 根据code_verifier生成code_challenge (使用S256方法)
     * Generate code_challenge from code_verifier (using S256 method)
     */
    static generateCodeChallenge(verifier: string): Promise<string>;
    /**
     * 验证code_verifier与code_challenge是否匹配
     * Verify if code_verifier matches code_challenge
     */
    static verifyPKCE(verifier: string, challenge: string): Promise<boolean>;
    /**
     * 验证code_challenge格式
     * Validate code_challenge format
     */
    static validateCodeChallenge(challenge: string): boolean;
    /**
     * 验证code_verifier格式
     * Validate code_verifier format
     */
    static validateCodeVerifier(verifier: string): boolean;
    /**
     * 生成完整的PKCE参数对
     * Generate complete PKCE parameter pair
     */
    static generatePKCEPair(): Promise<{
        codeVerifier: string;
        codeChallenge: string;
        codeChallengeMethod: string;
    }>;
    /**
     * 生成OAuth2 state参数
     * Generate OAuth2 state parameter
     */
    static generateState(): string;
}
/**
 * 导出默认实例，保持向后兼容
 * Export default instance for backward compatibility
 */
declare const browserPKCE: typeof BrowserPKCEUtils;

export { BrowserPKCEUtils, browserPKCE };
