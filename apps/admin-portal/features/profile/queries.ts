import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, authApi } from '../../lib/api';

// 使用 types/auth.ts 中的 User 类型，确保与 API 返回的类型一致
import { User } from '@/types/auth';

const profileKeys = {
  all: ['profile'] as const,
  detail: () => [...profileKeys.all, 'detail'] as const,
};

/**
 * 获取当前登录用户个人资料的 React Query Hook
 */
export const useProfileQuery = () => {
  return useQuery<User, Error>({
    queryKey: profileKeys.detail(),
    queryFn: async () => {
      const data = await authApi.fetchUserProfile();
      return data as unknown as User;
    },
  });
};

/**
 * 更新用户个人资料的 React Query Mutation Hook
 */
export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<User, Error, { displayName: string }>({
    mutationFn: async (profileData) => {
      // 只传递 displayName，且保证为 string
      await adminApi.updateUserProfile({ displayName: profileData.displayName });
      // 更新后重新获取最新用户信息，保证类型为 User
      const data = await authApi.fetchUserProfile();
      return data as unknown as User;
    },
    onSuccess: (data) => {
      // 更新成功后，使个人资料的查询缓存失效，以便重新获取最新数据
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() });
      // 也可以直接更新缓存中的数据以获得更快的UI响应
      queryClient.setQueryData(profileKeys.detail(), data);
    },
  });
};

/**
 * 更新用户密码的 React Query Mutation Hook
 */
export const useUpdatePasswordMutation = () => {
  return useMutation<void, Error, { currentPassword: string; newPassword: string }>({
    mutationFn: async (passwordData) => {
      await adminApi.updatePassword(passwordData);
    },
    // 成功后可以添加一些逻辑，例如提示用户密码修改成功
  });
};
