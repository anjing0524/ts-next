/**
 * API 客户端单元测试
 * 测试admin-portal的API调用功能
 */

import { adminApi } from '../../lib/api';
import { TokenStorage } from '../../lib/auth/token-storage';

// Mock TokenStorage
jest.mock('../../lib/auth/token-storage', () => ({
  TokenStorage: {
    getAccessToken: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

const mockTokenStorage = TokenStorage as jest.Mocked<typeof TokenStorage>;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTokenStorage.getAccessToken.mockReturnValue('mock-access-token');
  });

  describe('用户管理API', () => {
    describe('getUsers', () => {
      it('应该正确调用用户列表API', async () => {
        const mockResponse = {
          data: [
            { id: '1', username: 'user1', email: 'user1@test.com' },
            { id: '2', username: 'user2', email: 'user2@test.com' },
          ],
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 2,
            totalPages: 1,
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const result = await adminApi.getUsers({ offset: 0, limit: 10 });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v2/users?page=1&pageSize=10'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-access-token',
            }),
          })
        );

        expect(result).toEqual({
          data: mockResponse.data,
          meta: {
            totalItems: 2,
            itemCount: 2,
            itemsPerPage: 10,
            totalPages: 1,
            currentPage: 1,
          },
        });
      });

      it('应该正确转换offset/limit为page/pageSize', async () => {
        const mockResponse = {
          data: [],
          pagination: { page: 3, pageSize: 5, totalItems: 12, totalPages: 3 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        await adminApi.getUsers({ offset: 10, limit: 5, search: 'test' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('page=3&pageSize=5&search=test'),
          expect.anything()
        );
      });

      it('应该处理API错误', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as any);

        await expect(adminApi.getUsers({ offset: 0, limit: 10 }))
          .rejects.toThrow('Internal Server Error');
      });
    });

    describe('createUser', () => {
      it('应该正确调用创建用户API', async () => {
        const userData = {
          username: 'newuser',
          email: 'newuser@test.com',
          displayName: 'New User',
        };

        const mockResponse = {
          id: 'user-123',
          ...userData,
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const result = await adminApi.createUser(userData);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v2/users'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-access-token',
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(userData),
          })
        );

        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('角色管理API', () => {
    describe('getRoles', () => {
      it('应该正确调用角色列表API', async () => {
        const mockResponse = {
          data: [
            { id: '1', name: 'admin', description: 'Administrator' },
            { id: '2', name: 'user', description: 'Regular User' },
          ],
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 2,
            totalPages: 1,
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const result = await adminApi.getRoles({ offset: 0, limit: 10 });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v2/roles?page=1&pageSize=10'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-access-token',
            }),
          })
        );

        expect(result.data).toEqual(mockResponse.data);
      });
    });
  });

  describe('审计日志API', () => {
    describe('getAuditLogs', () => {
      it('应该正确调用审计日志API并转换参数', async () => {
        const mockResponse = {
          data: [
            {
              id: 'audit-1',
              userId: 'user-123',
              action: 'USER_LOGIN',
              timestamp: '2024-01-01T10:00:00Z',
              status: 'SUCCESS',
            },
          ],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 1,
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

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(
            '/api/v2/audit-logs?page=1&pageSize=20&action=USER_LOGIN&status=SUCCESS'
          ),
          expect.anything()
        );

        expect(result.meta).toEqual({
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 20,
          totalPages: 1,
          currentPage: 1,
        });
      });
    });
  });

  describe('错误处理', () => {
    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adminApi.getUsers({ offset: 0, limit: 10 }))
        .rejects.toThrow('Network error');
    });

    it('应该处理401未授权错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as any);

      await expect(adminApi.getUsers({ offset: 0, limit: 10 }))
        .rejects.toThrow('Unauthorized');
    });

    it('应该处理403禁止访问错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as any);

      await expect(adminApi.getUsers({ offset: 0, limit: 10 }))
        .rejects.toThrow('Forbidden');
    });
  });

  describe('认证头部', () => {
    it('当没有token时应该不包含Authorization头', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue(null);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      } as any);

      await adminApi.getUsers({ offset: 0, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.anything(),
          }),
        })
      );
    });

    it('当有token时应该包含Authorization头', async () => {
      mockTokenStorage.getAccessToken.mockReturnValue('test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      } as any);

      await adminApi.getUsers({ offset: 0, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });
  });
}); 