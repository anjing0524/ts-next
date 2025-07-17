'use client';

import { useAuth } from '@repo/ui/hooks';
import { PermissionGuard } from '@repo/ui';

/**
 * Dashboard路由组的受保护布局.
 * 重定向逻辑由 middleware.ts 处理.
 * 这个布局现在只负责UI和页面内的权限检查.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // The middleware handles the redirect, so we just need to handle the loading/permission state here.
  return (
    <main>
      {/* TODO: Add a proper dashboard shell (e.g., Header, Sidebar) */}
      <PermissionGuard
        user={user}
        isLoading={isLoading}
        requiredPermission="view:dashboard" // Example permission
        fallback={<div>You do not have permission to view this page.</div>}
      >
        {children}
      </PermissionGuard>
    </main>
  );
}
