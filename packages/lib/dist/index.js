'use strict';

// src/utils/browser-pkce-utils.ts
function base64URLEncode(buffer) {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateRandomString(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer).slice(0, length);
}
var BrowserPKCEUtils = class {
  /**
   * 生成PKCE code_verifier
   * Generate PKCE code_verifier
   *
   * RFC 7636 规定 code_verifier 长度应在 43-128 字符之间
   * RFC 7636 specifies code_verifier length should be 43-128 characters
   */
  static generateCodeVerifier() {
    return generateRandomString(128);
  }
  /**
   * 根据code_verifier生成code_challenge (使用S256方法)
   * Generate code_challenge from code_verifier (using S256 method)
   */
  static async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64URLEncode(digest);
  }
  /**
   * 验证code_verifier与code_challenge是否匹配
   * Verify if code_verifier matches code_challenge
   */
  static async verifyPKCE(verifier, challenge) {
    try {
      const computedChallenge = await this.generateCodeChallenge(verifier);
      return computedChallenge === challenge;
    } catch (error) {
      console.error("PKCE verification failed:", error);
      return false;
    }
  }
  /**
   * 验证code_challenge格式
   * Validate code_challenge format
   */
  static validateCodeChallenge(challenge) {
    const base64URLRegex = /^[A-Za-z0-9_-]{43}$/;
    return base64URLRegex.test(challenge);
  }
  /**
   * 验证code_verifier格式
   * Validate code_verifier format
   */
  static validateCodeVerifier(verifier) {
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
  static async generatePKCEPair() {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: "S256"
    };
  }
  /**
   * 生成OAuth2 state参数
   * Generate OAuth2 state parameter
   */
  static generateState() {
    return generateRandomString(32);
  }
};
var browserPKCE = BrowserPKCEUtils;

exports.BrowserPKCEUtils = BrowserPKCEUtils;
exports.browserPKCE = browserPKCE;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map