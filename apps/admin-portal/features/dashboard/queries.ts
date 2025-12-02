import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/api';
import type { SystemStatsSummary } from '../../lib/api/resources/system';

// 定义统计数据的类型，后续可以根据后端返回的实际结构进行完善
export interface DashboardStats {
  userCount: number;
  clientCount: number;
  roleCount: number;
  permissionCount: number;
  activeSessions: number;
  tokensIssuedToday: number;
  // 可以添加更多图表所需的数据
  userGrowth: { date: string; count: number }[];
}

const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
};

/**
 * 将 SystemStatsSummary 转换为 DashboardStats
 */
function transformStatsSummary(stats: SystemStatsSummary): DashboardStats {
  return {
    userCount: stats.totalUsers,
    clientCount: stats.totalClients,
    roleCount: stats.totalRoles,
    permissionCount: stats.totalPermissions,
    activeSessions: stats.activeUsers, // 使用活跃用户数作为活跃会话数
    tokensIssuedToday: stats.auditLogsToday, // 使用今日审计日志数作为今日颁发的令牌数
    userGrowth: [], // 暂时为空数组，后续可以从详细统计中获取
  };
}

/**
 * 获取仪表盘统计数据的 React Query Hook
 */
export const useDashboardStatsQuery = () => {
  return useQuery<DashboardStats, Error>({
    queryKey: dashboardKeys.stats(),
    queryFn: async () => {
      const stats = await adminApi.getStatsSummary();
      return transformStatsSummary(stats);
    },
    // 可以设置数据刷新间隔，例如每分钟刷新一次
    refetchInterval: 60 * 1000,
  });
};
