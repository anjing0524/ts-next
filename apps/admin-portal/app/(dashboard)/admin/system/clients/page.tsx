'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { ClientManagementView } from '@/features/clients/components/ClientManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:client:view', 'clients:list'];

/**
 * OAuth客户端管理页面
 * 提供OAuth客户端的增删改查功能，支持权限控制
 */
export default function GuardedClientsPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>您没有权限访问此页面。</div>}
      loadingFallback={<div>正在验证权限...</div>}
    >
      <ClientManagementView />
    </PermissionGuard>
  );
}