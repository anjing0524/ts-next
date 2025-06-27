'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import useAuth from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DataTable, type ColumnDef } from '@repo/ui';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  Label,
  Checkbox,
  toast,
  ScrollArea,
} from '@repo/ui';
import { PlusCircle, Edit, Trash2, ShieldCheck } from 'lucide-react';
import { RoleFormDialog } from '@/components/admin/roles/RoleFormDialog';
import type { Role, Permission, RoleFormData, PaginatedResponse } from '@/types/admin-entities'; // 引入共享类型

import { usePaginatedResource } from '@/hooks/usePaginatedResource'; // Import the hook

// --- 页面状态和常量 ---
const INITIAL_PAGE_LIMIT = 10;
const REQUIRED_PERMISSIONS_VIEW = ['menu:system:role:view', 'roles:list'];
// Individual action permissions (used by UI logic, backend enforces actual API calls)
const CAN_CREATE_ROLE = 'roles:create';
const CAN_EDIT_ROLE = 'roles:edit';
const CAN_DELETE_ROLE = 'roles:delete';
const CAN_MANAGE_PERMISSIONS = 'roles:manage_permissions';

// --- 角色管理页面核心内容 ---
function RolesPageContent() {
  const { hasPermission } = useAuth();

  const {
    data: roles,
    isLoading: isLoadingList,
    error: listError,
    offset, // Changed from page
    limit,
    totalItems,
    // totalPages, // Removed
    canLoadMore, // Added
    searchTerm,
    // setPage, // Replaced by setOffset or by loadMore
    setOffset, // Added
    setLimit,
    setSearchTerm,
    applyFiltersAndReset, // Renamed from applyFilters
    loadMore, // Added
    refreshData: fetchRoles,
  } = usePaginatedResource<Role, { offset: number; limit: number; search?: string }>( // Updated P type
    adminApi.getRoles,
    { initialLimit: INITIAL_PAGE_LIMIT }
  );

  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [isDialogLoading, setIsDialogLoading] = useState(false);

  // Fetch all available permissions (for permission management dialog)
  const fetchAllPermissions = useCallback(async () => {
    // This is not paginated by the hook, so manage its loading state separately if needed
    try {
      const response: PaginatedResponse<Permission> = await adminApi.getPermissions({
        limit: 1000,
      });
      setAllPermissions(response.data);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '加载权限列表失败: ' + err.message,
      });
    }
  }, []);

  useEffect(() => {
    if (isPermissionsDialogOpen && allPermissions.length === 0) {
      fetchAllPermissions();
    }
  }, [isPermissionsDialogOpen, fetchAllPermissions, allPermissions.length]);

  // --- Event Handlers ---
  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchSubmit = () => {
    applyFilters();
  };

  const openCreateDialog = () => {
    setRoleFormData({ name: '', description: '' });
    setCurrentRole(null);
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (role: Role) => {
    setCurrentRole(role);
    setRoleFormData({ name: role.name, description: role.description || '' });
    setIsEditDialogOpen(true);
  };

  const openPermissionsDialog = async (role: Role) => {
    setCurrentRole(role);
    setIsLoading(true);
    try {
      // Fetch current permissions for the role
      const roleDetailsWithPermissions = await adminApi.getRoleById(role.id);
      const currentPermissionIds = new Set(
        roleDetailsWithPermissions.permissions?.map((p: Permission) => p.id) || []
      );
      setSelectedPermissions(currentPermissionIds);
      setIsPermissionsDialogOpen(true);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '加载角色权限失败: ' + err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteDialog = (role: Role) => {
    setCurrentRole(role);
    setIsDeleteDialogOpen(true);
  };

  const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRoleFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateRole = async () => {
    if (!roleFormData.name) {
      toast({ variant: 'destructive', title: '错误', description: '角色名称不能为空。' });
      return;
    }
    setIsLoading(true);
    try {
      await adminApi.createRole(roleFormData);
      toast({ title: '成功', description: '角色已创建。' });
      setIsCreateDialogOpen(false);
      fetchRoles(); // Refresh list
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '创建角色失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!currentRole || !roleFormData.name) {
      toast({ variant: 'destructive', title: '错误', description: '角色名称不能为空。' });
      return;
    }
    setIsLoading(true);
    try {
      await adminApi.updateRole(currentRole.id, roleFormData);
      toast({ title: '成功', description: '角色已更新。' });
      setIsEditDialogOpen(false);
      fetchRoles(); // Refresh list
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '更新角色失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!currentRole) return;
    setIsLoading(true);
    try {
      await adminApi.deleteRole(currentRole.id);
      toast({ title: '成功', description: '角色已删除。' });
      setIsDeleteDialogOpen(false);
      fetchRoles(); // Refresh list
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '删除角色失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const handleSaveRolePermissions = async () => {
    if (!currentRole) return;
    setIsLoading(true);
    try {
      await adminApi.updateRolePermissions(currentRole.id, Array.from(selectedPermissions));
      toast({ title: '成功', description: '角色权限已更新。' });
      setIsPermissionsDialogOpen(false);
      // Optionally, refresh the specific role's data or the whole list if permissions affect display
      fetchRoles();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: err.message || '更新角色权限失败。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- DataTable Columns ---
  const columns = useMemo<ColumnDef<Role>[]>(
    () => [
      { accessorKey: 'name', header: '角色名称' },
      { accessorKey: 'description', header: '描述' },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) =>
          row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : 'N/A',
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => (
          <div className="space-x-2">
            {hasPermission(CAN_MANAGE_PERMISSIONS) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openPermissionsDialog(row.original)}
                title="管理权限"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            )}
            {hasPermission(CAN_EDIT_ROLE) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditDialog(row.original)}
                title="编辑角色"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {hasPermission(CAN_DELETE_ROLE) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => openDeleteDialog(row.original)}
                title="删除角色"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [hasPermission]
  ); // Add other dependencies if openXDialog functions are not stable via useCallback

  // --- Render Logic ---
  if (isLoading && !roles.length && page === 1) {
    return <div className="p-6 text-center">加载角色数据中...</div>;
  }
  if (error && !roles.length) {
    return <div className="p-6 text-red-600 text-center">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">角色管理</h1>
          <p className="text-muted-foreground mt-1">创建、编辑和管理用户角色及其权限。</p>
        </div>
        {hasPermission(CAN_CREATE_ROLE) && (
          <Button onClick={openCreateDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加角色
          </Button>
        )}
      </header>

      <div className="flex items-center gap-2 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="按角色名称搜索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-grow"
        />
        <Button onClick={handleSearch}>搜索</Button>
      </div>

      <DataTable
        columns={columns}
        data={roles}
        isLoading={isLoading && roles.length > 0}
        pageCount={totalPages}
        pageIndex={page - 1}
        pageSize={limit}
        onPageChange={(newPageIndex) => setPage(newPageIndex + 1)}
        onPageSizeChange={(newPageSize) => {
          setLimit(newPageSize);
          setPage(1);
        }}
      />
      {(totalItems > 0 || page > 1) && !isLoading && !error && (
        <div className="flex items-center justify-between mt-4 py-2 border-t">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页 (共 {totalItems} 条记录)
          </span>
          {/* Pagination buttons could be part of DataTable or separate */}
        </div>
      )}
      {roles.length === 0 && !isLoading && !error && (
        <div className="text-center py-10 text-muted-foreground">没有找到角色。</div>
      )}

      {/* --- Dialogs --- */}
      {/* Create Role Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新角色</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="name">角色名称</Label>
              <Input
                id="name"
                name="name"
                value={roleFormData.name}
                onChange={handleFormInputChange}
              />
            </div>
            <div>
              <Label htmlFor="description">描述</Label>
              <Input
                id="description"
                name="description"
                value={roleFormData.description}
                onChange={handleFormInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateRole} disabled={isLoading}>
              {isLoading ? '创建中...' : '创建角色'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑角色: {currentRole?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name">角色名称</Label>
              <Input
                id="edit-name"
                name="name"
                value={roleFormData.name}
                onChange={handleFormInputChange}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">描述</Label>
              <Input
                id="edit-description"
                name="description"
                value={roleFormData.description}
                onChange={handleFormInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateRole} disabled={isLoading}>
              {isLoading ? '更新中...' : '保存更改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Permissions Dialog */}
      <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>管理角色权限: {currentRole?.name}</DialogTitle>
          </DialogHeader>
          <DialogDescription>为该角色选择合适的权限。</DialogDescription>
          <ScrollArea className="h-72 my-4 pr-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allPermissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center space-x-2 p-2 border rounded-md"
                >
                  <Checkbox
                    id={`perm-${permission.id}`}
                    checked={selectedPermissions.has(permission.id)}
                    onCheckedChange={() => handlePermissionToggle(permission.id)}
                  />
                  <Label htmlFor={`perm-${permission.id}`} className="flex flex-col">
                    <span className="font-medium">{permission.name}</span>
                    {permission.description && (
                      <span className="text-xs text-muted-foreground">
                        {permission.description}
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
            {allPermissions.length === 0 && !isLoading && <p>暂无可用权限或加载失败。</p>}
            {isLoading && <p>加载权限中...</p>}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPermissionsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveRolePermissions} disabled={isLoading}>
              {isLoading ? '保存中...' : '保存权限'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除角色</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            您确定要删除角色 “{currentRole?.name}” 吗？此操作无法撤销。
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole} disabled={isLoading}>
              {isLoading ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Main Export with PermissionGuard ---
export default function GuardedRolesPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS_VIEW}>
      <RolesPageContent />
    </PermissionGuard>
  );
}
