'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { RoleManagementView } from '@/features/roles/components/RoleManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:role:view', 'roles:list'];

export default function GuardedRolesPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>You do not have permission to view this page.</div>}
      loadingFallback={<div>Verifying permissions...</div>}
    >
      <RoleManagementView />
    </PermissionGuard>
  );
}
