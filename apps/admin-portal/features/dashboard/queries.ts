import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/api';

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
 * 获取仪表盘统计数据的 React Query Hook
 */
export const useDashboardStatsQuery = () => {
  return useQuery<DashboardStats, Error>({
    queryKey: dashboardKeys.stats(),
    queryFn: () => adminApi.getStatsSummary(),
    // 可以设置数据刷新间隔，例如每分钟刷新一次
    refetchInterval: 60 * 1000,
  });
};
