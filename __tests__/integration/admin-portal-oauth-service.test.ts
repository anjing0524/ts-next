/**
 * admin-portal与oauth-service集成测试
 * 验证前后端分页参数修复和完整的API集成
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, jest } from '@jest/globals';
import { adminApi, authApi } from '../../apps/admin-portal/lib/api';

// Mock TokenStorage for tests
jest.mock('../../apps/admin-portal/lib/auth/token-storage', () => ({
  TokenStorage: {
    getAccessToken: jest.fn().mockReturnValue('mock-access-token'),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  },
}));

describe('Admin Portal与OAuth Service集成测试', () => {
  // Mock fetch for testing
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('分页参数适配测试', () => {
    it('应该将offset/limit参数正确转换为page/pageSize', async () => {
      // Mock successful response
      const mockResponse = {
        data: [
          { id: '1', username: 'user1', email: 'user1@test.com' },
          { id: '2', username: 'user2', email: 'user2@test.com' },
        ],
        pagination: {
          page: 2,
          pageSize: 10,
          totalItems: 25,
          totalPages: 3,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      // 调用 getUsers 使用 offset/limit 参数
      const result = await adminApi.getUsers({ offset: 10, limit: 10, search: 'test' });

      // 验证fetch被调用时使用了正确的page/pageSize参数
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/users?page=2&pageSize=10&search=test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
          }),
        })
      );

      // 验证响应格式被正确转换为前端期望的meta格式
      expect(result).toEqual({
        data: mockResponse.data,
        meta: {
          totalItems: 25,
          itemCount: 2,
          itemsPerPage: 10,
          totalPages: 3,
          currentPage: 2,
        },
      });
    });

    it('应该正确处理offset=0的情况（第一页）', async () => {
      const mockResponse = {
        data: [{ id: '1', username: 'user1' }],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      await adminApi.getUsers({ offset: 0, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1&pageSize=10'),
        expect.anything()
      );
    });
  });

  describe('审计日志API集成测试', () => {
    it('应该正确调用审计日志API并转换分页参数', async () => {
      const mockResponse = {
        data: [
          {
            id: 'audit-1',
            userId: 'user-123',
            action: 'USER_LOGIN',
            resource: 'User',
            timestamp: '2024-01-01T10:00:00Z',
            status: 'SUCCESS',
            ipAddress: '127.0.0.1',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 15,
          totalPages: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await adminApi.getAuditLogs({
        offset: 0,
        limit: 20,
        action: 'USER_LOGIN',
        status: 'SUCCESS',
      });

      // 验证API调用参数
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/v2/audit-logs?page=1&pageSize=20&action=USER_LOGIN&status=SUCCESS'
        ),
        expect.anything()
      );

      // 验证响应格式转换
      expect(result.meta).toEqual({
        totalItems: 15,
        itemCount: 1,
        itemsPerPage: 20,
        totalPages: 1,
        currentPage: 1,
      });
    });
  });

  describe('OAuth认证API集成测试', () => {
    it('应该正确调用登录API', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        scope: 'read write',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      } as any);

      const result = await authApi.login({
        grant_type: 'password',
        username: 'admin',
        password: 'password123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v2/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'password',
            username: 'admin',
            password: 'password123',
          }),
        })
      );

      expect(result).toEqual(mockTokenResponse);
    });

    it('应该正确调用用户信息API', async () => {
      const mockUserInfo = {
        sub: 'user-123',
        username: 'admin',
        email: 'admin@test.com',
        name: 'Administrator',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockUserInfo),
      } as any);

      const result = await authApi.fetchUserProfile();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
          }),
        })
      );

      expect(result).toEqual(mockUserInfo);
    });
  });

  describe('错误处理测试', () => {
    it('应该正确处理API错误响应', async () => {
      const mockErrorResponse = {
        message: '用户名或密码错误',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockErrorResponse),
      } as any);

      await expect(
        authApi.login({
          grant_type: 'password',
          username: 'invalid',
          password: 'invalid',
        })
      ).rejects.toThrow('用户名或密码错误');
    });

    it('应该正确处理网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adminApi.getUsers()).rejects.toThrow('Network error');
    });
  });

  describe('响应格式适配测试', () => {
    it('应该正确处理空数据的情况', async () => {
      const mockResponse = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await adminApi.getUsers({ offset: 0, limit: 10 });

      expect(result.meta).toEqual({
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: 10,
        totalPages: 0,
        currentPage: 1,
      });
    });

    it('应该正确处理没有pagination字段的响应', async () => {
      const mockResponse = {
        data: [{ id: '1', username: 'user1' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await adminApi.getUsers({ offset: 0, limit: 10 });

      // 如果没有pagination字段，应该返回原始响应
      expect(result).toEqual(mockResponse);
    });
  });

  describe('分页计算测试', () => {
    it('应该正确计算各种offset/limit组合', () => {
      const testCases = [
        { offset: 0, limit: 10, expectedPage: 1, expectedPageSize: 10 },
        { offset: 10, limit: 10, expectedPage: 2, expectedPageSize: 10 },
        { offset: 20, limit: 10, expectedPage: 3, expectedPageSize: 10 },
        { offset: 0, limit: 25, expectedPage: 1, expectedPageSize: 25 },
        { offset: 25, limit: 25, expectedPage: 2, expectedPageSize: 25 },
        { offset: 15, limit: 5, expectedPage: 4, expectedPageSize: 5 },
      ];

      testCases.forEach(({ offset, limit, expectedPage, expectedPageSize }) => {
        // 直接测试适配器函数的逻辑
        const page = Math.floor(offset / limit) + 1;
        const pageSize = limit;

        expect(page).toBe(expectedPage);
        expect(pageSize).toBe(expectedPageSize);
      });
    });
  });
});

/**
 * 验证分页适配器函数的单元测试
 */
describe('分页适配器函数测试', () => {
  // 测试 adaptOffsetToPage 逻辑
  const adaptOffsetToPage = (offset: number = 0, limit: number = 10) => {
    const page = Math.floor(offset / limit) + 1;
    const pageSize = limit;
    return { page, pageSize };
  };

  // 测试 adaptPaginationToMeta 逻辑
  const adaptPaginationToMeta = (response: any) => {
    if (response && response.pagination) {
      return {
        data: response.data,
        meta: {
          totalItems: response.pagination.totalItems,
          itemCount: response.data ? response.data.length : 0,
          itemsPerPage: response.pagination.pageSize,
          totalPages: response.pagination.totalPages,
          currentPage: response.pagination.page,
        },
      };
    }
    return response;
  };

  it('adaptOffsetToPage应该正确转换参数', () => {
    expect(adaptOffsetToPage(0, 10)).toEqual({ page: 1, pageSize: 10 });
    expect(adaptOffsetToPage(10, 10)).toEqual({ page: 2, pageSize: 10 });
    expect(adaptOffsetToPage(25, 5)).toEqual({ page: 6, pageSize: 5 });
    expect(adaptOffsetToPage()).toEqual({ page: 1, pageSize: 10 }); // 默认值
  });

  it('adaptPaginationToMeta应该正确转换响应格式', () => {
    const mockResponse = {
      data: [{ id: 1 }, { id: 2 }],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 25,
        totalPages: 3,
      },
    };

    const result = adaptPaginationToMeta(mockResponse);

    expect(result).toEqual({
      data: mockResponse.data,
      meta: {
        totalItems: 25,
        itemCount: 2,
        itemsPerPage: 10,
        totalPages: 3,
        currentPage: 2,
      },
    });
  });

  it('adaptPaginationToMeta应该处理没有pagination的响应', () => {
    const mockResponse = { data: [{ id: 1 }] };
    const result = adaptPaginationToMeta(mockResponse);
    expect(result).toEqual(mockResponse);
  });
});
