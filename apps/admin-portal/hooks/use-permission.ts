'use client';

import { useEffect, useState } from 'react';
import { PermissionService, UserContext } from '@/lib/permission/permission-service';

export interface UsePermissionOptions {
  cache?: boolean;
  autoRefresh?: boolean;
}

export function usePermission(
  permissionId: string,
  options: UsePermissionOptions = {}
) {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const checkPermission = async () => {
      try {
        setLoading(true);
        setError(null);

        const hasAccess = permissionService.hasPermission(permissionId, undefined, options);
        setHasPermission(hasAccess);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Permission check failed');
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();

    if (options.autoRefresh) {
      const interval = setInterval(checkPermission, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [permissionId, JSON.stringify(options)]);

  return { hasPermission, loading, error };
}

export function usePermissions(permissionIds: string[], options: UsePermissionOptions = {}) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        const permissionResults: Record<string, boolean> = {};
        
        for (const permissionId of permissionIds) {
          permissionResults[permissionId] = permissionService.hasPermission(permissionId, undefined, options);
        }

        setPermissions(permissionResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Permission check failed');
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();

    if (options.autoRefresh) {
      const interval = setInterval(checkPermissions, 60000);
      return () => clearInterval(interval);
    }
  }, [permissionIds.join(','), JSON.stringify(options)]);

  return { permissions, loading, error };
}

export function useRole(roleId: string) {
  const [hasRole, setHasRole] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const checkRole = async () => {
      try {
        setLoading(true);
        setError(null);

        const hasAccess = permissionService.hasRole(roleId);
        setHasRole(hasAccess);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Role check failed');
        setHasRole(false);
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [roleId]);

  return { hasRole, loading, error };
}

export function useUserContext() {
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const loadUserContext = async () => {
      try {
        setLoading(true);
        
        // Try to get current user context
        const context = permissionService['getCurrentUserContext']();
        setUserContext(context);
      } catch (error) {
        console.error('Error loading user context:', error);
        setUserContext(null);
      } finally {
        setLoading(false);
      }
    };

    loadUserContext();
  }, []);

  const refreshContext = async () => {
    try {
      setLoading(true);
      await permissionService.refreshPermissions();
      const context = permissionService['getCurrentUserContext']();
      setUserContext(context);
    } catch (error) {
      console.error('Error refreshing user context:', error);
    } finally {
      setLoading(false);
    }
  };

  return { userContext, loading, refreshContext };
}

export function useRoutePermission(path: string, method: string = 'GET') {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const checkRoutePermission = async () => {
      try {
        setLoading(true);
        setError(null);

        const hasAccess = permissionService.checkRoutePermission(path, method);
        setHasPermission(hasAccess);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Route permission check failed');
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkRoutePermission();
  }, [path, method]);

  return { hasPermission, loading, error };
}

export function useMenuPermissions() {
  const [menuItems, setMenuItems] = useState<Array<{
    path: string;
    title: string;
    icon?: string;
    requiredPermissions: string[];
  }>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const permissionService = PermissionService.getInstance();

  useEffect(() => {
    const loadMenuPermissions = async () => {
      try {
        setLoading(true);
        
        const items = permissionService.getMenuPermissions();
        setMenuItems(items);
      } catch (error) {
        console.error('Error loading menu permissions:', error);
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadMenuPermissions();
  }, []);

  return { menuItems, loading };
}