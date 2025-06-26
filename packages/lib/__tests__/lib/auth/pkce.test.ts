/**
 * PKCE (Proof Key for Code Exchange) 工具函数测试
 * 符合 RFC 7636 规范，OAuth2.1 强制要求
 * @author 测试团队
 * @since 1.0.0
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  isValidCodeVerifier,
  isSupportedChallengeMethod,
  validatePKCEParams,
} from '@/lib/auth/pkce';

describe('PKCE工具函数', () => {
  describe('generateCodeVerifier', () => {
    it('应该生成符合RFC 7636规范的code_verifier', () => {
      // Act
      const verifier = generateCodeVerifier();

      // Assert
      expect(verifier).toBeDefined();
      expect(typeof verifier).toBe('string');
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      
      // 验证字符集：[A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('应该生成不重复的code_verifier', () => {
      // Act
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      // Assert
      expect(verifier1).not.toBe(verifier2);
    });

    it('生成的code_verifier应该通过格式验证', () => {
      // Act
      const verifier = generateCodeVerifier();

      // Assert
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });
  });

  describe('generateCodeChallenge', () => {
    it('应该使用S256方法生成正确的code_challenge', () => {
      // Arrange
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      // Act
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Assert
      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBe(43); // Base64URL编码的SHA256哈希长度
      expect(challenge).not.toBe(verifier);
      
      // 验证是否为有效的Base64URL格式
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('应该使用plain方法返回原始verifier', () => {
      // Arrange
      const verifier = generateCodeVerifier();

      // Act
      const challenge = generateCodeChallenge(verifier, 'plain');

      // Assert
      expect(challenge).toBe(verifier);
    });

    it('默认应该使用S256方法', () => {
      // Arrange
      const verifier = generateCodeVerifier();

      // Act
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier, 'S256');

      // Assert
      expect(challenge1).toBe(challenge2);
    });

    it('应该拒绝不支持的挑战方法', () => {
      // Arrange
      const verifier = generateCodeVerifier();

      // Act & Assert
      expect(() => {
        generateCodeChallenge(verifier, 'MD5' as any);
      }).toThrow('Unsupported code challenge method: MD5');
    });
  });

  describe('verifyCodeChallenge', () => {
    it('应该验证S256方法的code_verifier和code_challenge匹配', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Act
      const isValid = verifyCodeChallenge(verifier, challenge, 'S256');

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该验证plain方法的code_verifier和code_challenge匹配', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'plain');

      // Act
      const isValid = verifyCodeChallenge(verifier, challenge, 'plain');

      // Assert
      expect(isValid).toBe(true);
    });

    it('应该拒绝不匹配的code_verifier和code_challenge', () => {
      // Arrange
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier1, 'S256');

      // Act
      const isValid = verifyCodeChallenge(verifier2, challenge, 'S256');

      // Assert
      expect(isValid).toBe(false);
    });

    it('应该处理无效的挑战方法', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Act
      const isValid = verifyCodeChallenge(verifier, challenge, 'INVALID' as any);

      // Assert
      expect(isValid).toBe(false);
    });

    it('默认应该使用S256方法验证', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Act
      const isValid1 = verifyCodeChallenge(verifier, challenge);
      const isValid2 = verifyCodeChallenge(verifier, challenge, 'S256');

      // Assert
      expect(isValid1).toBe(isValid2);
      expect(isValid1).toBe(true);
    });
  });

  describe('isValidCodeVerifier', () => {
    it('应该接受有效的code_verifier', () => {
      // Arrange
      const validVerifiers = [
        generateCodeVerifier(),
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', // 43字符
        'A'.repeat(43), // 最小长度
        'B'.repeat(128), // 最大长度
        'abc123-_~XYZ4567890123456789012345678901234', // 包含允许的字符，确保长度>=43
      ];

      // Act & Assert
      validVerifiers.forEach(verifier => {
        expect(isValidCodeVerifier(verifier)).toBe(true);
      });
    });

    it('应该拒绝无效的code_verifier', () => {
      // Arrange
      const invalidVerifiers = [
        '', // 空字符串
        'A'.repeat(42), // 长度不足
        'B'.repeat(129), // 长度超限
        'abc@123', // 包含不允许的字符@
        'abc 123', // 包含空格
        'abc+123', // 包含+号
        'abc/123', // 包含/号
        'abc=123', // 包含=号
      ];

      // Act & Assert
      invalidVerifiers.forEach(verifier => {
        expect(isValidCodeVerifier(verifier)).toBe(false);
      });
    });
  });

  describe('isSupportedChallengeMethod', () => {
    it('应该支持S256方法', () => {
      expect(isSupportedChallengeMethod('S256')).toBe(true);
    });

    it('应该支持plain方法', () => {
      expect(isSupportedChallengeMethod('plain')).toBe(true);
    });

    it('应该拒绝不支持的方法', () => {
      const unsupportedMethods = ['MD5', 'SHA1', 'BCRYPT', '', 'invalid'];
      
      unsupportedMethods.forEach(method => {
        expect(isSupportedChallengeMethod(method)).toBe(false);
      });
    });
  });

  describe('validatePKCEParams', () => {
    it('应该验证完整的有效PKCE参数', () => {
      // Arrange
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Act
      const result = validatePKCEParams({
        codeVerifier: verifier,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该要求code_challenge_method当提供code_challenge时', () => {
      // Arrange
      const challenge = generateCodeChallenge(generateCodeVerifier(), 'S256');

      // Act
      const result = validatePKCEParams({
        codeChallenge: challenge,
        // 缺少codeChallengeMethod
      });

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('code_challenge_method is required when code_challenge is provided');
    });

    it('应该拒绝不支持的code_challenge_method', () => {
      // Act
      const result = validatePKCEParams({
        codeChallengeMethod: 'MD5',
      });

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unsupported code_challenge_method: MD5');
    });

    it('应该拒绝无效格式的code_verifier', () => {
      // Act
      const result = validatePKCEParams({
        codeVerifier: 'invalid@verifier',
      });

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid code_verifier format');
    });

    it('应该拒绝不匹配的code_verifier和code_challenge', () => {
      // Arrange
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier1, 'S256');

      // Act
      const result = validatePKCEParams({
        codeVerifier: verifier2,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('code_verifier does not match code_challenge');
    });

    it('应该接受部分PKCE参数', () => {
      // Act & Assert
      // 只有code_challenge和method（授权请求阶段）
      const result1 = validatePKCEParams({
        codeChallenge: generateCodeChallenge(generateCodeVerifier(), 'S256'),
        codeChallengeMethod: 'S256',
      });
      expect(result1.isValid).toBe(true);

      // 只有code_verifier（令牌交换阶段）
      const result2 = validatePKCEParams({
        codeVerifier: generateCodeVerifier(),
      });
      expect(result2.isValid).toBe(true);

      // 空参数
      const result3 = validatePKCEParams({});
      expect(result3.isValid).toBe(true);
    });
  });

  describe('RFC 7636兼容性测试', () => {
    it('应该与RFC 7636示例兼容', () => {
      // Arrange - RFC 7636 Appendix B示例
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      // Act
      const challenge = generateCodeChallenge(verifier, 'S256');

      // Assert
      expect(challenge).toBe(expectedChallenge);
      expect(verifyCodeChallenge(verifier, expectedChallenge, 'S256')).toBe(true);
    });

    it('应该处理边界情况', () => {
      // 最小长度的verifier (43字符)
      const minVerifier = 'A'.repeat(43);
      expect(isValidCodeVerifier(minVerifier)).toBe(true);
      
      const minChallenge = generateCodeChallenge(minVerifier, 'S256');
      expect(verifyCodeChallenge(minVerifier, minChallenge, 'S256')).toBe(true);

      // 最大长度的verifier (128字符)
      const maxVerifier = 'B'.repeat(128);
      expect(isValidCodeVerifier(maxVerifier)).toBe(true);
      
      const maxChallenge = generateCodeChallenge(maxVerifier, 'S256');
      expect(verifyCodeChallenge(maxVerifier, maxChallenge, 'S256')).toBe(true);
    });
  });
}); 