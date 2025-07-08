'use client';

import { PermissionGuard } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { ClientManagementView } from '@/features/clients/components/ClientManagementView';

const REQUIRED_PERMISSIONS = ['menu:system:client:view', 'clients:list'];

export default function GuardedClientsPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user}
      isLoading={isLoading}
      fallback={<div>You do not have permission to view this page.</div>}
      loadingFallback={<div>Verifying permissions...</div>}
    >
      <ClientManagementView />
    </PermissionGuard>
  );
}
