'use client';

import { usePermissionManagement } from '@/features/permissions/hooks/use-permission-management';
import { useAuth } from '@repo/ui/hooks';
import { PermissionGuard } from '@repo/ui';
import { DataTable, type ColumnDef, Input, Button, Badge } from '@repo/ui';
import type { Permission } from '@/features/permissions/domain/permission';

const REQUIRED_PERMISSIONS_VIEW = ['menu:system:permission:view', 'permissions:list'];

function PermissionsPageContent() {
  const {
    permissions,
    meta,
    isLoading,
    isFetching,
    error,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
  } = usePermissionManagement();

  const columns: ColumnDef<Permission>[] = [
    {
      accessorKey: 'name',
      header: 'Permission Name',
      cell: ({ row }) => <Badge variant="secondary">{row.original.name}</Badge>,
    },
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'resource',
      header: 'Resource',
      cell: ({ row }) => row.original.resource || <span className="text-muted-foreground">N/A</span>,
    },
  ];

  if (isLoading) return <div>Loading permissions...</div>;
  if (error) return <div>Error loading permissions: {error.message}</div>;

  return (
    <div className="container mx-auto py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">System Permissions</h1>
        <p className="text-muted-foreground mt-1">View all defined permissions in the system.</p>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <Input
          placeholder="Search by name or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="flex-grow"
        />
        <Button onClick={handleSearchSubmit} disabled={isFetching}>
          Search
        </Button>
      </div>

      <DataTable
        columns={columns as ColumnDef<any, any>[]}
        data={permissions}
        isLoading={isFetching}
        pageCount={meta?.totalPages ?? 0}
        pageIndex={meta ? meta.currentPage - 1 : 0}
        pageSize={limit}
        onPageChange={(newPageIndex) => setPage(newPageIndex + 1)}
        onPageSizeChange={setLimit}
      />
    </div>
  );
}

export default function GuardedPermissionsPage() {
  const { user, isLoading } = useAuth();
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS_VIEW} user={user} isLoading={isLoading}>
      <PermissionsPageContent />
    </PermissionGuard>
  );
}