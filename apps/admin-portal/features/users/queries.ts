import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { User, CreateUserInput, UpdateUserInput, PaginatedResponse } from './domain/user';
import { UserService } from './application/user.service';
import { UserRepository } from './infrastructure/user.repository';
import { adminApi } from '../../lib/api'; // Still needed for stats summary if not moved to UserService

// 实例化 UserRepository 和 UserService
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

// 定义用户状态枚举（本地定义，避免导入错误）
enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

// 定义 useUsersQuery 的参数类型
interface UsersQueryVariables {
  offset?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  roleId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'username' | 'displayName';
  sortOrder?: 'asc' | 'desc';
}

// 查询键工厂 - 用于更好的查询键管理
export const userQueryKeys = {
  all: ['users'] as const,
  lists: () => [...userQueryKeys.all, 'list'] as const,
  list: (params: UsersQueryVariables) => [...userQueryKeys.lists(), params] as const,
  details: () => [...userQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...userQueryKeys.details(), id] as const,
  stats: () => [...userQueryKeys.all, 'stats'] as const,
  permissions: (userId: string) => [...userQueryKeys.all, 'permissions', userId] as const,
  roles: (userId: string) => [...userQueryKeys.all, 'roles', userId] as const,
  profile: (userId: string) => [...userQueryKeys.all, 'profile', userId] as const,
};

// 增强的用户列表查询
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userQueryKeys.list(params),
    queryFn: () => userService.getUsers(params),
    placeholderData: (previousData) => previousData,
    staleTime: 30 * 1000, // 30秒内数据被认为是新鲜的
    refetchOnWindowFocus: false, // 窗口获得焦点时不自动重新获取
  });
};

// 用户详情查询
export const useUserQuery = (userId: string | null) => {
  return useQuery<User, Error>({
    queryKey: userQueryKeys.detail(userId!),
    queryFn: () => userService.getUserById(userId!),
    enabled: !!userId, // 只有在 userId 存在时才执行查询
    staleTime: 60 * 1000, // 用户详情1分钟内保持新鲜
  });
};

// 用户统计查询 - 暂时使用现有API的统计功能
export const useUserStatsQuery = () => {
  return useQuery<any, Error>({
    queryKey: userQueryKeys.stats(),
    queryFn: async () => {
      // 使用现有的API获取统计数据
      const statsSummary = await adminApi.getStatsSummary();
      return statsSummary;
    },
    staleTime: 5 * 60 * 1000, // 统计数据5分钟内保持新鲜
    refetchInterval: 5 * 60 * 1000, // 每5分钟自动刷新
  });
};

// 搜索用户查询 - 支持防抖
export const useSearchUsersQuery = (
  searchTerm: string,
  options: {
    enabled?: boolean;
    debounceMs?: number;
  } = {}
) => {
  const { enabled = true } = options;

  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userQueryKeys.list({ search: searchTerm, limit: 20 }),
    queryFn: () => userService.getUsers({ search: searchTerm, limit: 20 }), // Using userService.getUsers
    enabled: enabled && searchTerm.length >= 2, // 至少2个字符才搜索
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
};

// 创建用户变更
export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<User, Error, CreateUserInput>({
    // Changed return type to User
    mutationFn: (userData) => userService.createUser(userData),
    onSuccess: (newUser) => {
      // 创建成功后，更新相关查询
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.stats() });

      // 直接设置新用户的缓存数据
      queryClient.setQueryData(userQueryKeys.detail(newUser.id), newUser);

      // 触发成功通知
      console.log('用户创建成功:', newUser.username);
    },
    onError: (error) => {
      console.error('用户创建失败:', error);
    },
  });
};

// 更新用户变更
export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<User, Error, { userId: string; userData: UpdateUserInput }>({
    mutationFn: ({ userId, userData }) => userService.updateUser(userId, userData),
    onSuccess: (updatedUser, { userId }) => {
      // 更新成功后，更新相关查询
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.stats() });

      // 直接更新用户详情缓存
      queryClient.setQueryData(userQueryKeys.detail(userId), updatedUser);

      console.log('用户更新成功:', updatedUser.username);
    },
    onError: (error) => {
      console.error('用户更新失败:', error);
    },
  });
};

// 删除用户变更
export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    // Changed return type to void
    mutationFn: (userId) => userService.deleteUser(userId),
    onSuccess: (_, userId) => {
      // 删除成功后，更新相关查询
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userQueryKeys.stats() });

      // 移除用户详情缓存
      queryClient.removeQueries({ queryKey: userQueryKeys.detail(userId) });

      console.log('用户删除成功');
    },
    onError: (error) => {
      console.error('用户删除失败:', error);
    },
  });
};

// 修改密码变更 - 使用现有的updatePassword方法
export const useChangePasswordMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { oldPassword?: string; newPassword?: string }>({
    // Changed return type to void
    mutationFn: (passwordData) => userService.updatePassword(passwordData),
    onSuccess: () => {
      // 密码修改成功后，可能需要更新当前用户信息
      queryClient.invalidateQueries({ queryKey: userQueryKeys.profile('current') });

      console.log('密码修改成功');
    },
    onError: (error) => {
      console.error('密码修改失败:', error);
    },
  });
};

// 自定义Hook：用户状态管理
export const useUserStatus = (userId: string | null) => {
  const { data: user } = useUserQuery(userId);

  return {
    isActive: user?.isActive ?? false,
    mustChangePassword: user?.mustChangePassword ?? false,
    canActivate: user ? user.isActive === false : false,
    canDeactivate: user ? user.isActive === true : false,
  };
};

// 自定义Hook：用户搜索防抖
export const useUserSearch = (initialSearchTerm: string = '') => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearchTerm);

  // 防抖处理
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const searchQuery = useSearchUsersQuery(debouncedSearchTerm);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    searchResults: searchQuery.data,
    isSearching: searchQuery.isLoading, // Changed to searchQuery.isLoading
    searchError: searchQuery.error,
  };
};

// 自定义Hook：分页用户列表
export const usePaginatedUsers = (initialParams: UsersQueryVariables = {}) => {
  const [params, setParams] = useState<UsersQueryVariables>(initialParams);

  const query = useUsersQuery(params);

  const updateParams = (newParams: Partial<UsersQueryVariables>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  };

  const resetParams = () => {
    setParams(initialParams);
  };

  const currentPage = Math.floor((params.offset || 0) / (params.limit || 10)) + 1;
  const totalPages = query.data?.meta?.totalPages || 0;

  return {
    ...query,
    params,
    updateParams,
    resetParams,
    totalPages,
    currentPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
};
