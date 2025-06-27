/**
 * 审计日志API 单元测试
 * 测试审计日志查询和统计功能
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/database';

// Mock Prisma
jest.mock('@repo/database', () => ({
  prisma: {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

// Mock 中间件
jest.mock('@repo/lib/middleware', () => ({
  withAuth: (handler: any, options: any) => handler,
}));

jest.mock('@repo/lib', () => ({
  withErrorHandling: (handler: any) => handler,
}));

const mockPrisma = prisma as any;

// 导入要测试的处理函数
import { GET } from '../../apps/oauth-service/app/api/v2/audit-logs/route';

describe('/api/v2/audit-logs', () => {
  // 测试数据
  const mockAuditLogs = [
    {
      id: 'audit-1',
      userId: 'user-123',
      action: 'user_created',
      resource: 'user:user-123',
      success: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      errorMessage: null,
      metadata: { username: 'testuser' },
      user: {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
      },
    },
    {
      id: 'audit-2',
      userId: 'user-123',
      action: 'user_updated',
      resource: 'user:user-456',
      success: true,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt: new Date('2024-01-01T11:00:00Z'),
      errorMessage: null,
      metadata: { targetUserId: 'user-456' },
      user: {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
      },
    },
    {
      id: 'audit-3',
      userId: 'user-123',
      action: 'user_delete_failed',
      resource: 'user:user-789',
      success: false,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt: new Date('2024-01-01T12:00:00Z'),
      errorMessage: 'User not found',
      metadata: { targetUserId: 'user-789' },
      user: {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
      },
    },
  ];

  const mockContext = {
    authContext: {
      user_id: 'admin-123',
      permissions: ['audit:list'],
    },
    params: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v2/audit-logs', () => {
    it('应该成功获取审计日志列表', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?page=1&pageSize=20';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalItems: 3,
        totalPages: 1,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按操作类型过滤', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?action=user_created';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0]]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.action).toBe('user_created');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: {
            contains: 'user_created',
            mode: 'insensitive',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按用户ID过滤', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?userId=user-123';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.userId).toBe('user-123');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按成功状态过滤', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?success=false';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[2]]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.success).toBe(false);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          success: false,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按时间范围过滤', async () => {
      const startDate = '2024-01-01T09:00:00Z';
      const endDate = '2024-01-01T13:00:00Z';
      const url = `http://localhost:3000/api/v2/audit-logs?startDate=${startDate}&endDate=${endDate}`;
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.startDate).toBe(startDate);
      expect(data.filters.endDate).toBe(endDate);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按资源过滤', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?resource=user:';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.resource).toBe('user:');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          resource: {
            contains: 'user:',
            mode: 'insensitive',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持按IP地址过滤', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?ipAddress=127.0.0.1';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters.ipAddress).toBe('127.0.0.1');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          ipAddress: {
            contains: '127.0.0.1',
            mode: 'insensitive',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该支持组合过滤条件', async () => {
      const url =
        'http://localhost:3000/api/v2/audit-logs?action=user_&success=true&userId=user-123';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0], mockAuditLogs[1]]);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          action: {
            contains: 'user_',
            mode: 'insensitive',
          },
          userId: 'user-123',
          success: true,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该正确处理分页', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?page=2&pageSize=10';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[0]]);
      mockPrisma.auditLog.count.mockResolvedValue(25);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination).toEqual({
        page: 2,
        pageSize: 10,
        totalItems: 25,
        totalPages: 3,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 10, // (page - 1) * pageSize = (2 - 1) * 10
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('应该限制最大页面大小', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?pageSize=500'; // 超过最大值100
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.pageSize).toBe(100); // 被限制为最大值

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        skip: 0,
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('当日期格式无效时应该返回400错误', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs?startDate=invalid-date';
      const request = new NextRequest(url);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('开始日期格式无效');
    });

    it('当数据库查询失败时应该返回500错误', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockRejectedValue(new Error('Database error'));

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.message).toBe('获取审计日志失败 (Failed to retrieve audit logs)');
    });
  });

  describe('审计日志数据验证', () => {
    it('应该返回包含用户信息的审计日志', async () => {
      const url = 'http://localhost:3000/api/v2/audit-logs';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);
      mockPrisma.auditLog.count.mockResolvedValue(3);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);

      // 验证每个审计日志都包含用户信息
      data.data.forEach((log: any) => {
        expect(log.user).toBeDefined();
        expect(log.user.id).toBeDefined();
        expect(log.user.username).toBeDefined();
        expect(log.user.displayName).toBeDefined();
      });
    });

    it('应该返回正确的过滤器信息', async () => {
      const url =
        'http://localhost:3000/api/v2/audit-logs?action=test&userId=user-123&success=true';
      const request = new NextRequest(url);

      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const response = await GET(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters).toEqual({
        action: 'test',
        userId: 'user-123',
        success: true,
        startDate: undefined,
        endDate: undefined,
        resource: undefined,
        ipAddress: undefined,
      });
    });
  });
});
