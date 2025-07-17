import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RoleService } from './application/role.service';
import { RoleRepository } from './infrastructure/role.repository';
import type { Role, CreateRoleInput, UpdateRoleInput } from './domain/role';
import { PaginatedResponse } from '../../lib/api';

// 实例化 RoleRepository 和 RoleService
const roleRepository = new RoleRepository();
const roleService = new RoleService(roleRepository);

export const useRolesQuery = (params: { page: number; limit: number; search?: string }) => {
  return useQuery<PaginatedResponse<Role>, Error>({
    queryKey: ['roles', params],
    queryFn: () => roleService.getRoles(params),
    placeholderData: (prev) => prev,
  });
};

export const useRoleQuery = (roleId: string | null) => {
  return useQuery<Role, Error>({
    queryKey: ['role', roleId],
    queryFn: () => roleService.getRoleById(roleId!),
    enabled: !!roleId,
  });
};

export const useCreateRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, CreateRoleInput>({
    mutationFn: (roleData: CreateRoleInput) => roleService.createRole(roleData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
};

export const useUpdateRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, { roleId: string; roleData: UpdateRoleInput }>({
    mutationFn: ({ roleId, roleData }: { roleId: string; roleData: UpdateRoleInput }) =>
      roleService.updateRole(roleId, roleData),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['role', roleId] });
    },
  });
};

export const useDeleteRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (roleId: string) => roleService.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
};

export const useUpdateRolePermissionsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { roleId: string; permissionIds: string[] }>({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      roleService.updateRolePermissions(roleId, permissionIds),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['role', roleId] });
    },
  });
};
