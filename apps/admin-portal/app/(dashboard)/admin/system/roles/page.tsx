'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { RoleManagementView } from '@/features/roles/components/RoleManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:role:view', 'roles:list'];

/**
 * 角色管理页面
 * 提供角色的增删改查功能，支持权限控制
 */
export default function GuardedRolesPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>您没有权限访问此页面。</div>}
      loadingFallback={<div>正在验证权限...</div>}
    >
      <RoleManagementView />
    </PermissionGuard>
  );
}