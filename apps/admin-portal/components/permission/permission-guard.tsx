'use client';

import { ReactNode } from 'react';
import { usePermission, useRole, usePermissions, UsePermissionOptions } from '@/hooks/use-permission';
import { AlertCircle, Shield } from 'lucide-react';

interface PermissionGuardProps {
  permissionId: string;
  children: ReactNode;
  fallback?: ReactNode;
  showAccessDenied?: boolean;
  options?: UsePermissionOptions;
}

export function PermissionGuard({
  permissionId,
  children,
  fallback,
  showAccessDenied = true,
  options = {},
}: PermissionGuardProps) {
  const { hasPermission, loading, error } = usePermission(permissionId, options);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">检查权限中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">权限检查失败</span>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showAccessDenied) {
      return (
        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              您没有访问此功能的权限
            </span>
          </div>
        </div>
      );
    }

    return null;
  }

  return <>{children}</>;
}

interface RoleGuardProps {
  roleId: string;
  children: ReactNode;
  fallback?: ReactNode;
  showAccessDenied?: boolean;
}

export function RoleGuard({
  roleId,
  children,
  fallback,
  showAccessDenied = true,
}: RoleGuardProps) {
  const { hasRole, loading, error } = useRole(roleId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">检查角色中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">角色检查失败</span>
        </div>
      </div>
    );
  }

  if (!hasRole) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showAccessDenied) {
      return (
        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              您没有访问此功能的角色权限
            </span>
          </div>
        </div>
      );
    }

    return null;
  }

  return <>{children}</>;
}

interface AnyPermissionGuardProps {
  permissionIds: string[];
  children: ReactNode;
  fallback?: ReactNode;
  showAccessDenied?: boolean;
  options?: UsePermissionOptions;
}

export function AnyPermissionGuard({
  permissionIds,
  children,
  fallback,
  showAccessDenied = true,
  options = {},
}: AnyPermissionGuardProps) {
  const { permissions, loading, error } = usePermissions(permissionIds, options);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">检查权限中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">权限检查失败</span>
        </div>
      </div>
    );
  }

  const hasAnyPermission = Object.values(permissions).some(hasPermission => hasPermission);

  if (!hasAnyPermission) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showAccessDenied) {
      return (
        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              您没有访问此功能的权限
            </span>
          </div>
        </div>
      );
    }

    return null;
  }

  return <>{children}</>;
}

interface AllPermissionsGuardProps {
  permissionIds: string[];
  children: ReactNode;
  fallback?: ReactNode;
  showAccessDenied?: boolean;
  options?: UsePermissionOptions;
}

export function AllPermissionsGuard({
  permissionIds,
  children,
  fallback,
  showAccessDenied = true,
  options = {},
}: AllPermissionsGuardProps) {
  const { permissions, loading, error } = usePermissions(permissionIds, options);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">检查权限中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">权限检查失败</span>
        </div>
      </div>
    );
  }

  const hasAllPermissions = Object.values(permissions).every(hasPermission => hasPermission);

  if (!hasAllPermissions) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showAccessDenied) {
      return (
        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              您没有访问此功能的全部权限
            </span>
          </div>
        </div>
      );
    }

    return null;
  }

  return <>{children}</>;
}