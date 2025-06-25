'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react'; // For loading spinner

interface PermissionGuardProps {
  requiredPermission: string | string[]; // Allow single permission or array of permissions (user must have ALL)
  children: ReactNode;
  fallback?: ReactNode; // Optional custom fallback UI if permission is denied
  loadingFallback?: ReactNode; // Optional custom loading UI
}

/**
 * PermissionGuard 组件用于保护需要特定权限才能访问的内容。
 * 它会检查当前用户是否拥有所需的权限。
 * - 如果正在加载认证状态或权限，显示加载指示器。
 * - 如果用户未认证或不拥有所需权限，重定向到未授权页面或显示回退UI。
 * - 如果用户拥有权限，则渲染子组件。
 *
 * @param requiredPermission - 查看子内容所需的单个权限字符串或权限字符串数组。
 *                             如果提供数组，用户必须拥有数组中的所有权限。
 * @param children - 当用户拥有权限时要渲染的内容。
 * @param fallback - (可选) 当权限不足时显示的回退UI，默认为null，此时会重定向。
 * @param loadingFallback - (可选) 当权限检查加载中时显示的UI。
 */
export function PermissionGuard({
  requiredPermission,
  children,
  fallback,
  loadingFallback,
}: PermissionGuardProps) {
  const { user, isLoading: authIsLoading, hasPermission } = useAuth();
  const router = useRouter();

  const checkPermissions = () => {
    if (Array.isArray(requiredPermission)) {
      return requiredPermission.every(permission => hasPermission(permission));
    }
    return hasPermission(requiredPermission);
  };

  const hasRequiredPermissions = user ? checkPermissions() : false;

  useEffect(() => {
    // 如果认证状态未在加载，且用户不存在（未登录），或者用户存在但没有所需权限，
    // 并且没有提供自定义 fallback UI，则重定向。
    if (!authIsLoading && (!user || !hasRequiredPermissions) && !fallback) {
      const permissionsQuery = Array.isArray(requiredPermission)
        ? requiredPermission.join(',')
        : requiredPermission;
      router.push(`/unauthorized?required_permission=${encodeURIComponent(permissionsQuery)}&from=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [authIsLoading, user, hasRequiredPermissions, requiredPermission, router, fallback]);

  if (authIsLoading) {
    return loadingFallback || (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">验证权限...</span>
      </div>
    );
  }

  if (!user || !hasRequiredPermissions) {
    return fallback || null; // 如果有 fallback UI 则显示，否则返回 null（useEffect会处理重定向）
  }

  return <>{children}</>;
}

/**
 * Higher-Order Component (HOC) version of PermissionGuard.
 * Wraps a page component to protect it with permission checks.
 *
 * @example
 * import { withPermission } from '@/components/auth/PermissionGuard';
 * function MyProtectedPage() { return <div>Secret Content</div>; }
 * export default withPermission(MyProtectedPage, 'view:secret_page');
 */
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredPermission: string | string[],
  options?: {
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
  }
) {
  const ComponentWithPermission = (props: P) => {
    return (
      <PermissionGuard
        requiredPermission={requiredPermission}
        fallback={options?.fallback}
        loadingFallback={options?.loadingFallback}
      >
        <WrappedComponent {...props} />
      </PermissionGuard>
    );
  };
  // Assign a display name for easier debugging in React DevTools
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  ComponentWithPermission.displayName = `withPermission(${displayName})`;

  return ComponentWithPermission;
}

// Usage examples:
//
// 1. Wrapping content directly in JSX:
// <PermissionGuard requiredPermission="edit:document">
//   <button>Edit Document</button>
// </PermissionGuard>
//
// 2. Protecting a whole page using the HOC (in the page file itself):
// const MyPage = () => { /* page content */ };
// export default withPermission(MyPage, 'view:my_page');
//
// 3. Using a custom fallback:
// <PermissionGuard requiredPermission="admin:access" fallback={<div>You are not an admin.</div>}>
//   <AdminDashboard />
// </PermissionGuard>
```
