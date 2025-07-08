'use client';

import { useQuery } from '@tanstack/react-query';

// 模拟的 API 调用函数
const fetchDashboardStats = async () => {
  console.log("Fetching dashboard stats...");
  // 在实际应用中，这里会是一个 API 调用
  // e.g., return await adminApi.getDashboardStats();
  
  // 返回模拟数据以供构建
  await new Promise(resolve => setTimeout(resolve, 500)); // 模拟网络延迟
  return {
    userCount: 1250,
    clientCount: 42,
    roleCount: 15,
    tokensIssuedToday: 873,
    userGrowth: [
      { date: 'Mon', count: 20 },
      { date: 'Tue', count: 35 },
      { date: 'Wed', count: 22 },
      { date: 'Thu', count: 45 },
      { date: 'Fri', count: 60 },
      { date: 'Sat', count: 75 },
      { date: 'Sun', count: 90 },
    ],
  };
};

export function useDashboardStatsQuery() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchDashboardStats,
  });
}
