'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { PermissionManagementView } from '@/features/permissions/components/PermissionManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:permission:view', 'permissions:list'];

/**
 * 权限管理页面
 * 提供权限的增删改查功能，支持权限控制
 */
export default function GuardedPermissionsPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>您没有权限访问此页面。</div>}
      loadingFallback={<div>正在验证权限...</div>}
    >
      <PermissionManagementView />
    </PermissionGuard>
  );
}