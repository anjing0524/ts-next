# Server Actions Migration Guide

**Status:** Implementation Guide for Tasks 15-17
**Last Updated:** 2025-12-03

## Overview

This guide provides step-by-step instructions for completing the frontend migration from TanStack Query to Server Actions. All Server Actions hooks have been created - this guide shows how to integrate them into your components.

## Migration Pattern

### Before (TanStack Query):
```typescript
'use client';
import { useUserManagement } from '../hooks/use-user-management';

export function UserManagementView() {
  const { users, areUsersLoading, ... } = useUserManagement();
  // Component uses users data from TanStack Query
}
```

### After (Server Actions):
```typescript
'use client';
import { useUserManagementServerActions } from '../hooks/use-user-management-server-actions';

export function UserManagementView() {
  const { users, areUsersLoading, ... } = useUserManagementServerActions();
  // Component uses users data from Server Actions
}
```

## Task 15: Remove Old Code

### Files to Delete/Deprecate

**User Management (OLD):**
```
- features/users/queries.ts              ← OLD TanStack Query hooks
- features/users/application/user.service.ts
- features/users/infrastructure/user.repository.ts
- features/users/domain/user.ts
```

**Client Management (OLD):**
```
- features/clients/queries.ts
- features/clients/application/client.service.ts
- features/clients/infrastructure/client.repository.ts
- features/clients/domain/client.ts
```

**Permission/Role Management (OLD):**
```
- features/permissions/queries.ts
- features/permissions/application/permission.service.ts
- features/permissions/infrastructure/permission.repository.ts
```

**Audit Log Management (OLD):**
```
- features/audit/queries.ts
- features/audit/application/audit.service.ts
- features/audit/infrastructure/audit.repository.ts
```

### Cleanup Steps:

1. **After each component update**, remove the old query/service files
2. **Update imports** in components from old hooks to new hooks
3. **Verify** component still works with new hook interface

## Task 16: Update Components

### Pattern for Component Update

#### Step 1: Update the Hook Import

```typescript
// BEFORE
import { useUserManagement } from '../hooks/use-user-management';

// AFTER
import { useUserManagementServerActions as useUserManagement } from '../hooks/use-user-management-server-actions';
```

> ✅ **Tip:** Aliasing the import name keeps component code unchanged!

#### Step 2: Component Already Compatible

The new hooks are designed with the same return interface as the old ones, so **most components need NO changes**:

```typescript
// This works the same with both old and new hooks
export function UserManagementView() {
  const {
    users,
    areUsersLoading,
    handleCreate,
    handleUpdate,
    handleDelete,
    // ... all other properties work the same
  } = useUserManagement();

  // Component renders exactly the same
  return <DataTable columns={columns} data={users} isLoading={areUsersLoading} />;
}
```

### Component Files to Update

#### Task 11: User Management
- `features/users/components/UserManagementView.tsx`
  - Update import in line 7
  - No other changes needed!

#### Task 12: Client Management
- `features/clients/components/ClientManagementView.tsx`
  - Update import statement
  - Add `refreshClients()` call after successful operations if needed

#### Task 13: Role & Permission Management
- `features/permissions/components/PermissionManagementView.tsx`
  - Update import statement
  - Use `refreshPermissions()` and `refreshRoles()` for UI updates

#### Task 14: Audit Log Management
- `features/audit/components/AuditLogView.tsx`
  - Update import statement
  - Use `selectedUserId` and `setSelectedUserId` for user filtering

## Task 17: Verification & Documentation

### Testing Checklist

Before completing the migration, verify:

- [ ] **User Management Page**
  - [ ] Page loads without errors
  - [ ] User data displays correctly
  - [ ] Add user modal works
  - [ ] Edit user modal works
  - [ ] Delete user confirmation works

- [ ] **Client Management Page**
  - [ ] Client list loads and displays
  - [ ] Pagination works
  - [ ] Modal operations work

- [ ] **Role Management Page**
  - [ ] Permissions list loads
  - [ ] Roles list loads
  - [ ] Role assignment works
  - [ ] Role revocation works

- [ ] **Audit Log Page**
  - [ ] All logs display
  - [ ] User filtering works
  - [ ] Pagination works
  - [ ] Timestamps display correctly

### Browser Console Check

Ensure no console errors appear:
- ✅ No "use server" directive errors
- ✅ No missing Server Action errors
- ✅ No type mismatches
- ✅ All async operations complete

### Performance Verification

The new implementation should be:
- ✅ **Faster:** Native Rust calls vs HTTP roundtrips
- ✅ **Cleaner:** No decorator middleware overhead
- ✅ **More secure:** Server-side only token handling
- ✅ **Type-safe:** End-to-end TypeScript coverage

## New Hook Interfaces

### useUserManagementServerActions()

```typescript
interface UseUserManagementReturn {
  // Data
  users: UserInfo[];
  usersMeta: { totalPages: number; total: number } | null;
  areUsersLoading: boolean;
  usersError: Error | null;

  // Table State
  pagination: PaginationState;
  setPagination: (state: PaginationState) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // Modal State
  isModalOpen: boolean;
  selectedUser: UserInfo | null;
  isDeleteConfirmOpen: boolean;
  isProcessing: boolean;

  // Methods
  openCreateModal: () => void;
  openEditModal: (user: UserInfo) => void;
  closeModal: () => void;
  openDeleteConfirm: (user: UserInfo) => void;
  closeDeleteConfirm: () => void;
  handleCreate: (data: Partial<UserInfo>) => Promise<void>;
  handleUpdate: (data: Partial<UserInfo>) => Promise<void>;
  handleDelete: () => Promise<void>;
}
```

### useClientManagementServerActions()

Same interface as `useUserManagement` but with:
- `ClientInfoPublic` instead of `UserInfo`
- Additional `refreshClients()` method

### useRoleManagementServerActions()

```typescript
interface UseRoleManagementReturn {
  // Permissions
  permissions: Permission[];
  permissionsMeta: { total: number } | null;
  arePermissionsLoading: boolean;

  // Roles
  roles: Role[];
  rolesMeta: { total: number } | null;
  areRolesLoading: boolean;

  // State & Table
  error: Error | null;
  pagination: PaginationState;
  sorting: SortingState;
  isProcessing: boolean;

  // Methods
  refreshPermissions: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  assignRoleToUser: (userId: string, roleId: string) => Promise<void>;
  revokeRoleFromUser: (userId: string, roleId: string) => Promise<void>;
}
```

### useAuditManagementServerActions()

```typescript
interface UseAuditManagementReturn {
  // Data
  auditLogs: AuditLog[];
  auditLogsMeta: { total: number; totalPages: number } | null;
  areLogsLoading: boolean;
  logsError: Error | null;

  // Filters
  selectedUserId: string | null;
  setSelectedUserId: (userId: string | null) => void;

  // State & Methods
  pagination: PaginationState;
  sorting: SortingState;
  refreshLogs: () => Promise<void>;
  refreshUserLogs: (userId: string) => Promise<void>;
}
```

## Common Integration Patterns

### Loading Data on Mount

❌ **OLD:**
```typescript
useEffect(() => {
  // TanStack Query handles this automatically
}, []);
```

✅ **NEW:**
```typescript
useEffect(() => {
  // Server Actions hooks load data automatically
  // but you can manually refresh if needed:
  // refreshClients();
}, []);
```

### Handling Errors

Both old and new versions support error state the same way:

```typescript
if (clientsError) {
  return <ErrorDisplay error={clientsError} />;
}
```

### Optimistic Updates

The new hooks don't require optimistic updates (unlike TanStack Query):

```typescript
// Just call the action and UI updates after server response
const handleCreate = async (data) => {
  await createClient(data); // Wait for server response
  // UI automatically updates from server data
};
```

## Migration Execution Order

Recommended order for safe migration:

1. **First:** Audit Logs (read-only, simplest)
   - No complex state management
   - Test pattern on simpler feature

2. **Second:** Role Management (mostly read-only)
   - Tests filtering and list operations
   - Tests relationship operations

3. **Third:** Client Management (read/write)
   - Tests all CRUD operations
   - More complex state

4. **Last:** User Management (might have most data)
   - Should have confidence from previous migrations
   - Most critical user-facing feature

## Troubleshooting

### Issue: "use server" Error

**Cause:** Server Action imported in client component
**Solution:** Ensure imports are only in `app/actions/` directory

### Issue: Empty Data

**Cause:** Hook didn't fetch data on mount
**Solution:** Call `refreshLogs()`, `refreshClients()` etc. in `useEffect`

### Issue: Stale Data

**Cause:** Data not refreshing after mutations
**Solution:** Call refresh method after successful operation

### Issue: Type Mismatch

**Cause:** Using old hook types with new hook
**Solution:** Update type imports to use new types from `app/actions/types`

## Files Status

### ✅ COMPLETE (Ready for Use)
- `app/actions/` - All Server Actions implemented
- `features/*/hooks/use-*-management-server-actions.ts` - All migration hooks created

### 🔄 IN PROGRESS (Component Updates)
- `features/*/components/*View.tsx` - Update hook imports
- `features/*/hooks/use-*.ts` - Can delete after components updated

### ⏳ PENDING (Cleanup)
- Remove old query/service/repository files
- Update documentation
- Final testing

## Quick Checklist for Each Feature

```
Task 11: User Management
- [ ] Update UserManagementView.tsx import
- [ ] Test all operations work
- [ ] Delete old queries.ts, service.ts, repository.ts
- [ ] Delete old domain folder

Task 12: Client Management
- [ ] Update ClientManagementView.tsx import
- [ ] Test pagination
- [ ] Delete old client files

Task 13: Role Management
- [ ] Update PermissionManagementView.tsx import
- [ ] Test role assignment
- [ ] Delete old permission files

Task 14: Audit Logs
- [ ] Update AuditLogView.tsx import
- [ ] Test user filtering
- [ ] Delete old audit files

Task 17: Final Verification
- [ ] All pages load without errors
- [ ] No console errors
- [ ] All operations work
- [ ] Update README with new architecture
```

---

**Next Steps:**
1. Pick one feature to migrate (recommend: Audit Logs first)
2. Update the component import
3. Test thoroughly
4. Delete old code
5. Move to next feature

**Support:**
- Refer to existing Server Actions in `app/actions/` for patterns
- Check hook return types in this guide
- All hooks provide same interface as old ones for minimal changes

---

*Generated: 2025-12-03*
*Maintained by: Claude Code*
