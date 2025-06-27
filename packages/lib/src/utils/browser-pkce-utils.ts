/**
 * 浏览器兼容的PKCE工具类
 * Browser-compatible PKCE utility class
 *
 * 使用Web Crypto API实现，适用于浏览器环境
 * Uses Web Crypto API, suitable for browser environments
 */

/**
 * Base64URL编码函数
 * Base64URL encoding function
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 生成加密安全的随机字符串
 * Generate cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer).slice(0, length);
}

/**
 * 浏览器PKCE工具类
 * Browser PKCE utility class
 */
export class BrowserPKCEUtils {
  /**
   * 生成PKCE code_verifier
   * Generate PKCE code_verifier
   *
   * RFC 7636 规定 code_verifier 长度应在 43-128 字符之间
   * RFC 7636 specifies code_verifier length should be 43-128 characters
   */
  static generateCodeVerifier(): string {
    return generateRandomString(128);
  }

  /**
   * 根据code_verifier生成code_challenge (使用S256方法)
   * Generate code_challenge from code_verifier (using S256 method)
   */
  static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(digest);
  }

  /**
   * 验证code_verifier与code_challenge是否匹配
   * Verify if code_verifier matches code_challenge
   */
  static async verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
    try {
      const computedChallenge = await this.generateCodeChallenge(verifier);
      return computedChallenge === challenge;
    } catch (error) {
      console.error('PKCE verification failed:', error);
      return false;
    }
  }

  /**
   * 验证code_challenge格式
   * Validate code_challenge format
   */
  static validateCodeChallenge(challenge: string): boolean {
    // Base64URL格式，长度应为43个字符（SHA256 hash的Base64URL编码）
    // Base64URL format, length should be 43 characters (Base64URL encoded SHA256 hash)
    const base64URLRegex = /^[A-Za-z0-9_-]{43}$/;
    return base64URLRegex.test(challenge);
  }

  /**
   * 验证code_verifier格式
   * Validate code_verifier format
   */
  static validateCodeVerifier(verifier: string): boolean {
    // RFC 7636: code_verifier长度应在43-128字符之间，只包含A-Z, a-z, 0-9, "-", ".", "_", "~"
    // RFC 7636: code_verifier length should be 43-128 characters, containing only A-Z, a-z, 0-9, "-", ".", "_", "~"
    if (verifier.length < 43 || verifier.length > 128) {
      return false;
    }
    const allowedCharsRegex = /^[A-Za-z0-9\-._~]+$/;
    return allowedCharsRegex.test(verifier);
  }

  /**
   * 生成完整的PKCE参数对
   * Generate complete PKCE parameter pair
   */
  static async generatePKCEPair(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: string;
  }> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * 生成OAuth2 state参数
   * Generate OAuth2 state parameter
   */
  static generateState(): string {
    return generateRandomString(32);
  }
}

/**
 * 导出默认实例，保持向后兼容
 * Export default instance for backward compatibility
 */
export const browserPKCE = BrowserPKCEUtils;
