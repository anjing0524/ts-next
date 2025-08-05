import { useQuery } from '@tanstack/react-query';
import { PermissionService } from './application/permission.service';
import { PermissionRepository } from './infrastructure/permission.repository';
import { PaginatedResponse } from '@/lib/api';
import { Permission } from './domain/permission';

// 实例化 PermissionRepository 和 PermissionService
const permissionRepository = new PermissionRepository();
const permissionService = new PermissionService(permissionRepository);

export const usePermissionsQuery = (params: { page: number; limit: number; search?: string }) => {
  return useQuery<PaginatedResponse<Permission>, Error>({
    queryKey: ['permissions', params],
    queryFn: () => permissionService.getPermissions(params),
    placeholderData: (prev) => prev,
  });
};
