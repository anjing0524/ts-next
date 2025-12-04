/**
 * 权限 React Query Hooks (Permission React Query Hooks)
 *
 * 提供权限数据管理的 React Query Hook
 * Provides React Query Hooks for permission data management
 */

import { useQuery } from '@tanstack/react-query';

/**
 * 权限查询键工厂 (Permission Query Keys)
 */
const permissionKeys = {
  all: ['permissions'] as const,
  list: () => [...permissionKeys.all, 'list'] as const,
  listWithParams: (params: any) => [...permissionKeys.list(), params] as const,
};

/**
 * 获取权限列表的 React Query Hook (Get Permissions List Hook)
 */
export const usePermissionsQuery = (params: any) => {
  return useQuery({
    queryKey: permissionKeys.listWithParams(params),
    queryFn: async () => {
      console.warn('usePermissionsQuery: 占位符实现 (Placeholder implementation)');
      return {
        data: [],
        meta: {
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10,
        },
      };
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};
