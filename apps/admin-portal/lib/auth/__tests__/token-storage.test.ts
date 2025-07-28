/**
 * @jest-environment jsdom
 */

import { TokenStorage } from '../token-storage';

// 模拟环境变量
const mockEnv = {
  NODE_ENV: 'production',
};

// 创建sessionStorage的模拟
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// 保存原始的window对象
const originalWindow = window;

describe('TokenStorage - 安全Cookie配置', () => {
  beforeEach(() => {
    // 重置环境变量
    process.env.NODE_ENV = mockEnv.NODE_ENV;
    
    // 清除所有cookies和重置sessionStorage模拟
    document.cookie.split(';').forEach(cookie => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    });
    
    // 设置sessionStorage的模拟
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
    });
    
    Object.defineProperty(window, 'Storage', {
      value: mockSessionStorage,
      writable: true,
    });
    
    mockSessionStorage.getItem.mockClear();
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();
    
    // 重置document.cookie的setter/getter
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setTokens方法的安全配置', () => {
    it('应该设置带有安全属性的cookie', () => {
      const accessToken = 'test-access-token';
      const refreshToken = 'test-refresh-token';
      
      TokenStorage.setTokens(accessToken, refreshToken);
      
      const cookieString = document.cookie;
      expect(cookieString).toContain('access_token=test-access-token');
      expect(cookieString).toContain('HttpOnly');
      expect(cookieString).toContain('Secure');
      expect(cookieString).toContain('SameSite=Lax');
      expect(cookieString).toMatch(/Max-Age=\d+/);
    });

    it('应该根据环境变量设置Secure属性', () => {
      // 测试开发环境
      process.env.NODE_ENV = 'development';
      TokenStorage.setTokens('dev-token');
      const devCookie = document.cookie;
      
      // 清除cookie
      document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      
      // 测试生产环境
      process.env.NODE_ENV = 'production';
      TokenStorage.setTokens('prod-token');
      const prodCookie = document.cookie;
      
      // 开发环境可能不包含Secure属性
      // 生产环境应该包含Secure属性
      expect(prodCookie).toContain('Secure');
    });

    it('应该设置合理的过期时间', () => {
      const accessToken = 'test-token';
      TokenStorage.setTokens(accessToken);
      
      const cookieString = document.cookie;
      const maxAgeMatch = cookieString.match(/Max-Age=(\d+)/);
      expect(maxAgeMatch).toBeTruthy();
      expect(Number(maxAgeMatch![1])).toBeGreaterThan(0);
      expect(Number(maxAgeMatch![1])).toBeLessThanOrEqual(86400); // 24小时
    });

    it('应该正确设置sessionStorage中的refresh token', () => {
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';
      
      TokenStorage.setTokens(accessToken, refreshToken);
      
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('refresh_token', refreshToken);
    });
  });

  describe('clearTokens方法的安全配置', () => {
    it('应该正确清除tokens', () => {
      // 先设置tokens
      TokenStorage.setTokens('access-token', 'refresh-token');
      
      // 验证已设置
      expect(document.cookie).toContain('access_token=access-token');
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-token');
      
      // 清除tokens
      TokenStorage.clearTokens();
      
      // 验证已清除
      expect(document.cookie).not.toContain('access_token=access-token');
      expect(document.cookie).toContain('access_token='); // 应该有过期的cookie
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('refresh_token');
    });

    it('清除cookie时应该包含安全属性', () => {
      TokenStorage.setTokens('test-token');
      TokenStorage.clearTokens();
      
      const cookieString = document.cookie;
      expect(cookieString).toContain('expires=Thu, 01 Jan 1970 00:00:00 GMT');
      expect(cookieString).toContain('HttpOnly');
      expect(cookieString).toContain('Secure');
      expect(cookieString).toContain('SameSite=Lax');
    });
  });

  describe('边界条件测试', () => {
    it('应该在服务器环境跳过cookie设置', () => {
      // 模拟服务器环境
      const originalWindow = global.window;
      delete (global as any).window;
      
      expect(() => {
        TokenStorage.setTokens('test-token');
      }).not.toThrow();
      
      // 恢复window对象
      global.window = originalWindow;
    });

    it('应该处理空的refresh token', () => {
      TokenStorage.setTokens('access-token');
      
      expect(document.cookie).toContain('access_token=access-token');
      expect(mockSessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('应该处理无sessionStorage的环境', () => {
      const originalStorage = global.Storage;
      delete (global as any).Storage;
      
      expect(() => {
        TokenStorage.setTokens('access-token', 'refresh-token');
      }).not.toThrow();
      
      // 恢复Storage
      global.Storage = originalStorage;
    });
  });

  describe('getTokens方法测试', () => {
    it('应该正确获取access token', () => {
      document.cookie = 'access_token=test-access-token; path=/';
      
      const token = TokenStorage.getAccessToken();
      expect(token).toBe('test-access-token');
    });

    it('应该正确获取refresh token', () => {
      mockSessionStorage.getItem.mockReturnValue('test-refresh-token');
      
      const token = TokenStorage.getRefreshToken();
      expect(token).toBe('test-refresh-token');
      expect(mockSessionStorage.getItem).toHaveBeenCalledWith('refresh_token');
    });

    it('应该处理不存在的token', () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      
      expect(TokenStorage.getAccessToken()).toBeNull();
      expect(TokenStorage.getRefreshToken()).toBeNull();
    });
  });
});