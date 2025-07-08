/**
 * admin-portal与oauth-service集成测试
 * 验证前后端分页参数修复和完整的API集成
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import * as TokenStorageModule from '../../lib/auth/token-storage';
import { adminApi, authApi } from '../../lib/api';

describe('Admin Portal与OAuth Service集成测试', () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  let tokenSpy: jest.SpiedFunction<typeof TokenStorageModule.TokenStorage.getAccessToken>;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    mockFetch.mockClear();
    // Use jest.spyOn for a more robust mock
    tokenSpy = jest.spyOn(TokenStorageModule.TokenStorage, 'getAccessToken').mockReturnValue('mock-access-token');
  });

  afterEach(() => {
    // Restore the original implementation after each test
    tokenSpy.mockRestore();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('分页参数适配测试', () => {
    it('应该���offset/limit参数正确转换为page/pageSize', async () => {
      const mockResponse = {
        data: [{ id: '1', username: 'user1' }],
        pagination: { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => mockResponse,
      } as any);

      const result = await adminApi.getUsers({ offset: 10, limit: 10, search: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/users?page=2&pageSize=10&search=test'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-access-token' }),
        })
      );

      expect(result.meta.currentPage).toBe(2);
    });
  });

  describe('OAuth认证API集成测试', () => {
    it('应该正确调用用户信息API', async () => {
      const mockUserInfo = { sub: 'user-123', username: 'admin' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => mockUserInfo,
      } as any);

      const result = await authApi.fetchUserProfile();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-access-token' }),
        })
      );
      expect(result).toEqual(mockUserInfo);
    });
  });
});
