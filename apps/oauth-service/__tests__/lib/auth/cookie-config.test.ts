import { NextRequest, NextResponse } from 'next/server';
import { getCookieConfig } from '@/lib/auth/cookie-config';

// 模拟环境变量
const mockEnv = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  COOKIE_SAMESITE: 'Lax',
  COOKIE_MAX_AGE: '86400',
};

describe('Cookie安全配置', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 重置环境变量
    process.env.NODE_ENV = mockEnv.NODE_ENV;
    process.env.COOKIE_SECURE = mockEnv.COOKIE_SECURE;
    process.env.COOKIE_SAMESITE = mockEnv.COOKIE_SAMESITE;
    process.env.COOKIE_MAX_AGE = mockEnv.COOKIE_MAX_AGE;
  });

  describe('getCookieConfig函数', () => {
    it('应该返回正确的安全配置', () => {
      const config = getCookieConfig();
      
      expect(config).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 86400,
        path: '/',
      });
    });

    it('应该根据环境变量调整配置', () => {
      process.env.NODE_ENV = 'development';
      process.env.COOKIE_SECURE = 'false';
      process.env.COOKIE_SAMESITE = 'Strict';
      process.env.COOKIE_MAX_AGE = '7200';

      const config = getCookieConfig();
      
      expect(config.secure).toBe(false);
      expect(config.sameSite).toBe('Strict');
      expect(config.maxAge).toBe(7200);
    });

    it('应该使用默认值当环境变量未设置', () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.COOKIE_SAMESITE;
      delete process.env.COOKIE_MAX_AGE;

      const config = getCookieConfig();
      
      expect(config.secure).toBe(process.env.NODE_ENV === 'production');
      expect(config.sameSite).toBe('Lax');
      expect(config.maxAge).toBe(3600);
    });

    it('应该验证SameSite值的有效性', () => {
      process.env.COOKIE_SAMESITE = 'Invalid';

      expect(() => {
        getCookieConfig();
      }).toThrow('Invalid SameSite value');
    });

    it('应该验证maxAge值的有效性', () => {
      process.env.COOKIE_MAX_AGE = 'invalid-number';

      expect(() => {
        getCookieConfig();
      }).toThrow('Invalid maxAge value');
    });
  });

  describe('NextResponse Cookie配置', () => {
    it('应该在NextResponse中正确应用cookie配置', () => {
      const response = NextResponse.json({ success: true });
      
      response.cookies.set('test-cookie', 'test-value', getCookieConfig());
      
      const cookieHeader = response.headers.get('set-cookie');
      expect(cookieHeader).toContain('test-cookie=test-value');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('Secure');
      expect(cookieHeader).toContain('SameSite=Lax');
    });
  });
});