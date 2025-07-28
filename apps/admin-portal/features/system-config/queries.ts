import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SystemConfigService } from './application/system-config.service';
import { SystemConfigRepository } from './infrastructure/system-config.repository';
import { SystemConfig } from './domain/system-config'; // 从新的 system-config.ts 导入

// 实例化 SystemConfigRepository 和 SystemConfigService
const systemConfigRepository = new SystemConfigRepository();
const systemConfigService = new SystemConfigService(systemConfigRepository);

const systemConfigKeys = {
  all: ['systemConfig'] as const,
  detail: () => [...systemConfigKeys.all, 'detail'] as const,
};

/**
 * 获取系统配置的 React Query Hook
 */
export const useSystemConfigQuery = () => {
  return useQuery<SystemConfig[], Error>({
    queryKey: systemConfigKeys.detail(),
    queryFn: () => systemConfigService.getSystemConfig(),
  });
};

/**
 * 更新系统配置的 React Query Mutation Hook
 */
export const useUpdateSystemConfigMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<SystemConfig[], Error, Partial<SystemConfig>[]>({
    mutationFn: (configData) => systemConfigService.updateSystemConfig(configData),
    onSuccess: (data) => {
      queryClient.setQueryData(systemConfigKeys.detail(), data);
    },
  });
};
