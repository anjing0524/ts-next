'use client';

import { useAuth } from '@repo/ui/hooks';
import { PermissionGuard } from '@repo/ui';
import { DashboardShell } from '@/components/layout/DashboardShell';

/**
 * Dashboard 路由组的受保护布局
 * 所有 /admin/* 路由都会经过这个布局的权限检查
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard 
      requiredPermission="view:dashboard"
      user={user}
      isLoading={isLoading}
      fallback={<div className="flex h-screen items-center justify-center">您没有权限访问仪表盘。</div>}
      loadingFallback={<div className="flex h-screen items-center justify-center">正在验证权限...</div>}
    >
      <DashboardShell>
        {children}
      </DashboardShell>
    </PermissionGuard>
  );
}
