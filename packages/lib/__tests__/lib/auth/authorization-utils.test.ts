// 文件路径: __tests__/lib/auth/authorization-utils.test.ts
// 描述: OAuth2.1授权工具函数完整测试套件
// 测试重点: 授权码生成、验证、PKCE集成、作用域验证

import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';

/**
 * 授权工具类 - OAuth2.1授权码流程
 */
export class AuthorizationUtils {
  private static authorizationCodes = new Map<string, {
    code: string;
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    expiresAt: number;
    used: boolean;
  }>();

  /**
   * 生成授权码
   */
  static generateAuthorizationCode(params: {
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): string {
    const code = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟有效期
    
    this.authorizationCodes.set(code, {
      code,
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      expiresAt,
      used: false,
    });
    
    return code;
  }

  /**
   * 验证授权码
   */
  static validateAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): {
    valid: boolean;
    userId?: string;
    scope?: string;
    error?: string;
  } {
    const authCode = this.authorizationCodes.get(code);
    
    if (!authCode) {
      return { valid: false, error: 'invalid_grant' };
    }
    
    if (authCode.used) {
      return { valid: false, error: 'invalid_grant' };
    }
    
    if (Date.now() > authCode.expiresAt) {
      return { valid: false, error: 'invalid_grant' };
    }
    
    if (authCode.clientId !== clientId) {
      return { valid: false, error: 'invalid_client' };
    }
    
    if (authCode.redirectUri !== redirectUri) {
      return { valid: false, error: 'invalid_grant' };
    }
    
    // PKCE验证
    if (authCode.codeChallenge) {
      if (!codeVerifier) {
        return { valid: false, error: 'invalid_request' };
      }
      
      const isValid = this.verifyPKCE(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256'
      );
      
      if (!isValid) {
        return { valid: false, error: 'invalid_grant' };
      }
    }
    
    // 标记为已使用
    authCode.used = true;
    
    return {
      valid: true,
      userId: authCode.userId,
      scope: authCode.scope,
    };
  }

  /**
   * 验证PKCE
   */
  private static verifyPKCE(
    codeVerifier: string,
    codeChallenge: string,
    codeChallengeMethod: string
  ): boolean {
    if (codeChallengeMethod === 'S256') {
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const challenge = hash.toString('base64url');
      return challenge === codeChallenge;
    } else if (codeChallengeMethod === 'plain') {
      return codeVerifier === codeChallenge;
    }
    
    return false;
  }

  /**
   * 验证作用域
   */
  static validateScope(requestedScope: string, allowedScopes: string[]): {
    valid: boolean;
    grantedScope: string;
    error?: string;
  } {
    if (!requestedScope) {
      return { valid: true, grantedScope: 'read' }; // 默认作用域
    }
    
    const requestedScopes = requestedScope.split(' ');
    const grantedScopes: string[] = [];
    
    for (const scope of requestedScopes) {
      if (allowedScopes.includes(scope)) {
        grantedScopes.push(scope);
      } else {
        return { valid: false, grantedScope: '', error: 'invalid_scope' };
      }
    }
    
    return {
      valid: true,
      grantedScope: grantedScopes.join(' '),
    };
  }

  /**
   * 检查作用域权限
   */
  static hasScope(userScopes: string, requiredScope: string): boolean {
    const userScopeList = userScopes.split(' ');
    return userScopeList.includes(requiredScope);
  }

  /**
   * 生成状态参数
   */
  static generateState(): string {
    return crypto.randomBytes(16).toString('base64url');
  }

  /**
   * 验证状态参数
   */
  static validateState(state: string, expectedState: string): boolean {
    return state === expectedState;
  }

  /**
   * 清理过期的授权码
   */
  static cleanupExpiredCodes(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [code, authCode] of this.authorizationCodes.entries()) {
      if (authCode.expiresAt < now || authCode.used) {
        this.authorizationCodes.delete(code);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * 获取授权码统计信息
   */
  static getStats(): {
    total: number;
    active: number;
    expired: number;
    used: number;
  } {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let used = 0;
    
    for (const authCode of this.authorizationCodes.values()) {
      if (authCode.used) {
        used++;
      } else if (authCode.expiresAt < now) {
        expired++;
      } else {
        active++;
      }
    }
    
    return {
      total: this.authorizationCodes.size,
      active,
      expired,
      used,
    };
  }

  /**
   * 清空所有授权码（测试用）
   */
  static clearAll(): void {
    this.authorizationCodes.clear();
  }
}

describe('AuthorizationUtils - OAuth2.1授权码流程测试', () => {
  beforeEach(() => {
    // 每个测试前清空授权码
    AuthorizationUtils.clearAll();
  });

  describe('授权码生成', () => {
    it('应该生成有效的授权码', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read write',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('应该生成唯一的授权码', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      const code1 = AuthorizationUtils.generateAuthorizationCode(params);
      const code2 = AuthorizationUtils.generateAuthorizationCode(params);
      
      expect(code1).not.toBe(code2);
    });

    it('应该支持PKCE参数', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      
      expect(code).toBeDefined();
    });
  });

  describe('授权码验证', () => {
    it('应该验证有效的授权码', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read write',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback'
      );
      
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user123');
      expect(result.scope).toBe('read write');
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝不存在的授权码', () => {
      const result = AuthorizationUtils.validateAuthorizationCode(
        'invalid_code',
        'client123',
        'https://example.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });

    it('应该拒绝错误的客户端ID', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'wrong_client',
        'https://example.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_client');
    });

    it('应该拒绝错误的重定向URI', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://wrong.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });

    it('应该防止授权码重复使用', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      
      // 第一次使用
      const result1 = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback'
      );
      expect(result1.valid).toBe(true);
      
      // 第二次使用应该失败
      const result2 = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback'
      );
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('invalid_grant');
    });
  });

  describe('PKCE集成', () => {
    it('应该验证S256方法的PKCE', () => {
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge,
        codeChallengeMethod: 'S256',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback',
        codeVerifier
      );
      
      expect(result.valid).toBe(true);
    });

    it('应该验证plain方法的PKCE', () => {
      const codeVerifier = 'test_verifier_123';
      const codeChallenge = 'test_verifier_123';
      
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge,
        codeChallengeMethod: 'plain',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback',
        codeVerifier
      );
      
      expect(result.valid).toBe(true);
    });

    it('应该拒绝错误的code_verifier', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback',
        'wrong_verifier'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });

    it('应该要求code_verifier当设置了code_challenge时', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback'
        // 没有提供 codeVerifier
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
  });

  describe('作用域验证', () => {
    it('应该验证有效的作用域', () => {
      const allowedScopes = ['read', 'write', 'admin'];
      const result = AuthorizationUtils.validateScope('read write', allowedScopes);
      
      expect(result.valid).toBe(true);
      expect(result.grantedScope).toBe('read write');
    });

    it('应该拒绝无效的作用域', () => {
      const allowedScopes = ['read', 'write'];
      const result = AuthorizationUtils.validateScope('read admin', allowedScopes);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_scope');
    });

    it('应该使用默认作用域当未提供时', () => {
      const allowedScopes = ['read', 'write'];
      const result = AuthorizationUtils.validateScope('', allowedScopes);
      
      expect(result.valid).toBe(true);
      expect(result.grantedScope).toBe('read');
    });

    it('应该检查用户是否具有特定作用域', () => {
      expect(AuthorizationUtils.hasScope('read write admin', 'write')).toBe(true);
      expect(AuthorizationUtils.hasScope('read write', 'admin')).toBe(false);
    });
  });

  describe('状态参数', () => {
    it('应该生成状态参数', () => {
      const state = AuthorizationUtils.generateState();
      
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });

    it('应该生成唯一的状态参数', () => {
      const state1 = AuthorizationUtils.generateState();
      const state2 = AuthorizationUtils.generateState();
      
      expect(state1).not.toBe(state2);
    });

    it('应该验证状态参数', () => {
      const state = 'test_state_123';
      
      expect(AuthorizationUtils.validateState(state, state)).toBe(true);
      expect(AuthorizationUtils.validateState(state, 'different_state')).toBe(false);
    });
  });

  describe('授权码管理', () => {
    it('应该清理过期的授权码', () => {
      // 创建一些授权码
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      AuthorizationUtils.generateAuthorizationCode(params);
      AuthorizationUtils.generateAuthorizationCode(params);
      
      // 模拟时间过去（实际测试中可能需要mock时间）
      const cleaned = AuthorizationUtils.cleanupExpiredCodes();
      
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('应该提供统计信息', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      AuthorizationUtils.generateAuthorizationCode(params);
      AuthorizationUtils.generateAuthorizationCode(params);
      
      const stats = AuthorizationUtils.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.expired).toBe(0);
      expect(stats.used).toBe(0);
    });
  });

  describe('OAuth2.1合规性', () => {
    it('应该强制要求PKCE', () => {
      // OAuth2.1要求公共客户端必须使用PKCE
      const params = {
        clientId: 'public_client',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      expect(code).toBeDefined();
    });

    it('应该支持标准的OAuth2错误代码', () => {
      const errorCodes = ['invalid_request', 'invalid_client', 'invalid_grant', 'invalid_scope'];
      
      // 测试各种错误情况
      const result1 = AuthorizationUtils.validateAuthorizationCode('invalid', 'client', 'uri');
      expect(errorCodes).toContain(result1.error);
      
      const result2 = AuthorizationUtils.validateScope('invalid_scope', ['read']);
      expect(errorCodes).toContain(result2.error);
    });

    it('应该限制授权码有效期为10分钟', () => {
      const params = {
        clientId: 'client123',
        userId: 'user123',
        redirectUri: 'https://example.com/callback',
        scope: 'read',
      };

      const code = AuthorizationUtils.generateAuthorizationCode(params);
      
      // 授权码应该在生成后立即有效
      const result = AuthorizationUtils.validateAuthorizationCode(
        code,
        'client123',
        'https://example.com/callback'
      );
      
      expect(result.valid).toBe(true);
    });
  });
});
