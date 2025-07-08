'use client';

import { PermissionGuard, type GuardUser } from '@repo/ui';
import { useAuth } from '@repo/ui';
import { AuditLogView } from '../../../../features/audit/components/AuditLogView';

const REQUIRED_PERMISSIONS = ['menu:system:audit:view', 'audit:list'];

export default function GuardedAuditLogsPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={REQUIRED_PERMISSIONS}
      user={user as GuardUser | null}
      isLoading={isLoading}
      fallback={<div>You do not have permission to view this page.</div>}
      loadingFallback={<div>Verifying permissions...</div>}
    >
      <AuditLogView />
    </PermissionGuard>
  );
}
