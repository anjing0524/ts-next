'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui';
import { UserManagementView } from '../../../../features/users/components/UserManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:user:view', 'users:list'];

export default function GuardedUsersPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>You do not have permission to view this page.</div>}
      loadingFallback={<div>Verifying permissions...</div>}
    >
      <UserManagementView />
    </PermissionGuard>
  );
}
