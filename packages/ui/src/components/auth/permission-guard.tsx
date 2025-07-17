'use client';

import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react'; // For loading spinner

// The user object shape expected by this component.
// Applications using this component must provide a user object that matches this shape.
export interface GuardUser {
  permissions?: string[];
}

interface PermissionGuardProps {
  user: GuardUser | null;
  isLoading: boolean;
  requiredPermission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * A pure UI component to guard content based on user permissions.
 * It is decoupled from any specific auth hook.
 *
 * @param user - The user object, or null if not authenticated. Must contain a `permissions` array.
 * @param isLoading - Boolean indicating if the user/auth state is currently loading.
 * @param requiredPermission - The permission(s) required to view the content.
 * @param children - The content to render if the user has permission.
 * @param fallback - A fallback UI to show if the user lacks permission. If not provided, renders nothing.
 * @param loadingFallback - A fallback UI to show while permissions are being verified.
 */
export function PermissionGuard({
  user,
  isLoading,
  requiredPermission,
  children,
  fallback = null,
  loadingFallback = (
    <div className="flex justify-center items-center h-32">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2">Verifying permissions...</span>
    </div>
  ),
}: PermissionGuardProps) {
  const hasPermission = (permission: string): boolean => {
    return user?.permissions?.includes(permission) ?? false;
  };

  const checkPermissions = () => {
    if (Array.isArray(requiredPermission)) {
      return requiredPermission.every(hasPermission);
    }
    return hasPermission(requiredPermission);
  };

  const hasRequiredPermissions = user ? checkPermissions() : false;

  if (isLoading) {
    return loadingFallback;
  }

  if (!user || !hasRequiredPermissions) {
    return fallback;
  }

  return <>{children}</>;
}
