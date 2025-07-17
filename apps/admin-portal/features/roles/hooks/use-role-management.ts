import { useState, useMemo } from 'react';
import {
  useRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useUpdateRolePermissionsMutation,
} from '../queries';
import { toast } from '@repo/ui';
import type { Role, CreateRoleInput, UpdateRoleInput } from '../domain/role';

export const useRoleManagement = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isPermissionsEditorOpen, setPermissionsEditorOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const queryParams = useMemo(
    () => ({ page, limit, search: appliedSearchTerm }),
    [page, limit, appliedSearchTerm]
  );
  const { data, isLoading, error, isFetching } = useRolesQuery(queryParams);

  const handleApiError = (err: any, context: string) => {
    toast({ variant: 'destructive', title: `Error ${context}`, description: err.message });
  };

  const createRoleMutation = useCreateRoleMutation();
  const updateRoleMutation = useUpdateRoleMutation();
  const deleteRoleMutation = useDeleteRoleMutation();
  const updatePermissionsMutation = useUpdateRolePermissionsMutation();

  const openCreateModal = () => {
    setSelectedRole(null);
    setIsModalOpen(true);
  };

  const openEditModal = (role: Role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const openPermissionsEditor = (role: Role) => {
    setSelectedRole(role);
    setPermissionsEditorOpen(true);
  };

  const openDeleteConfirm = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteConfirmOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPermissionsEditorOpen(false);
    setIsDeleteConfirmOpen(false);
    setSelectedRole(null);
  };

  const saveRole = (roleData: CreateRoleInput | UpdateRoleInput) => {
    if (selectedRole) {
      // Update existing role
      updateRoleMutation.mutate(
        { roleId: selectedRole.id, roleData: roleData as UpdateRoleInput },
        {
          onSuccess: () => {
            toast({ variant: 'success', title: 'Success', description: 'Role updated.' });
            closeModal();
          },
          onError: (err) => handleApiError(err, 'updating role'),
        }
      );
    } else {
      // Create new role
      createRoleMutation.mutate(roleData as CreateRoleInput, {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Success', description: 'Role created.' });
          closeModal();
        },
        onError: (err) => handleApiError(err, 'creating role'),
      });
    }
  };

  const deleteRole = () => {
    if (!selectedRole) return;
    deleteRoleMutation
      .mutateAsync(selectedRole.id)
      .then(() => {
        toast({ variant: 'success', title: 'Success', description: 'Role deleted.' });
        closeModal();
      })
      .catch((err) => handleApiError(err, 'deleting role'));
  };

  const savePermissions = (permissionIds: string[]) => {
    if (!selectedRole) return;
    updatePermissionsMutation
      .mutateAsync({ roleId: selectedRole.id, permissionIds })
      .then(() => {
        toast({ variant: 'success', title: 'Success', description: 'Role permissions updated.' });
        closeModal();
      })
      .catch((err) => handleApiError(err, 'updating permissions'));
  };

  return {
    roles: data?.data ?? [],
    meta: data?.meta,
    isLoading,
    isFetching,
    error,
    isModalOpen,
    isDeleteConfirmOpen,
    isPermissionsEditorOpen,
    selectedRole,
    openCreateModal,
    openEditModal,
    openPermissionsEditor,
    openDeleteConfirm,
    closeModal,
    saveRole,
    deleteRole,
    savePermissions,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearch: () => {
      setPage(1);
      setAppliedSearchTerm(searchTerm);
    },
  };
};
