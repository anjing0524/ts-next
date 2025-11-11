'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { ConfigManagementView } from '@/features/system-config/components/ConfigManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:config:view'];

/**
 * 系统配置管理页面
 * 提供系统配置参数的管理功能，支持权限控制
 */
export default function GuardedConfigPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>您没有权限访问此页面。</div>}
      loadingFallback={<div>正在验证权限...</div>}
    >
      <ConfigManagementView />
    </PermissionGuard>
  );
}