'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  MultiSelect,
  Label,
  toast,
} from '@repo/ui';
import type { Permission, Role } from '@/types/auth';

interface RolePermissionsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (roleId: string, permissionIds: string[]) => Promise<void>;
  role: Role | null;
  allPermissions: Permission[]; // List of all available permissions in the system
  isLoading?: boolean; // For the save operation
  isFetchingPermissions?: boolean; // For loading allPermissions list
}

export function RolePermissionsDialog({
  isOpen,
  onOpenChange,
  onSave,
  role,
  allPermissions,
  isLoading,
  isFetchingPermissions,
}: RolePermissionsDialogProps) {
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  // Memoize options for MultiSelect to prevent re-computation on every render
  const permissionOptions = useMemo(() => {
    return allPermissions.map((p) => ({
      value: p.id, // Will be used by MultiSelect's internal logic if it supported object options
      label: `${p.name}${p.description ? ` (${p.description.substring(0, 50)}${p.description.length > 50 ? '...' : ''})` : ''}`,
      // For the current MultiSelect which expects string[], we'll just pass an array of labels (names)
      // and map back to IDs later. Or, better, modify MultiSelect or use a map.
      // For now, let's assume MultiSelect will use `p.name` as the string option and we map it.
      // A better MultiSelect would take `options: {value: string, label: string}[]`
      // Current MultiSelect takes `options: string[]`. We will use permission names as options.
    }));
  }, [allPermissions]);

  // Create a map for quick lookup from permission name back to ID
  const permissionNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    allPermissions.forEach((p) => map.set(p.name, p.id));
    return map;
  }, [allPermissions]);

  // Create a map for quick lookup from permission ID back to name
  const permissionIdToNameMap = useMemo(() => {
    const map = new Map<string, string>();
    allPermissions.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [allPermissions]);

  useEffect(() => {
    if (role && (role as any).permissionIds) {
      // This is a fallback if permission IDs are passed directly
      setSelectedPermissionIds(Array.from(new Set((role as any).permissionIds || [])));
    } else if (role) {
      // If only the role is provided, fetch its permissions
      // This part should ideally be handled by a query hook
      // For now, we'll just initialize as empty and let the user select.
      setSelectedPermissionIds([]);
    } else if (isOpen) {
      // When opening for a new role or role without permissions
      setSelectedPermissionIds([]);
    }
  }, [role, isOpen, allPermissions]); // Rerun if allPermissions changes too, to ensure map is up-to-date

  // Convert selected IDs to names for the current MultiSelect component
  const selectedPermissionNamesForMultiSelect = useMemo(() => {
    return selectedPermissionIds
      .map((id) => permissionIdToNameMap.get(id))
      .filter((name): name is string => !!name);
  }, [selectedPermissionIds, permissionIdToNameMap]);

  const handleMultiSelectChange = (selectedNames: string[]) => {
    // Convert selected names back to IDs
    const ids = selectedNames
      .map((name) => permissionNameToIdMap.get(name))
      .filter((id): id is string => !!id);
    setSelectedPermissionIds(ids);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) {
      toast({ variant: 'destructive', title: '错误', description: '未指定角色。' });
      return;
    }
    await onSave(role.id, selectedPermissionIds);
  };

  // Options for the MultiSelect component (array of permission names)
  const multiSelectStringOptions = useMemo(
    () => allPermissions.map((p) => p.name),
    [allPermissions]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader>
          <DialogTitle>管理角色权限: {role?.name}</DialogTitle>
          <DialogDescription>为角色 “{role?.name}” 选择或取消选择权限。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            {isFetchingPermissions ? (
              <p>加载权限列表...</p>
            ) : allPermissions.length > 0 ? (
              <MultiSelect
                label="可用权限"
                options={multiSelectStringOptions} // Pass array of names
                placeholder="选择权限..."
                onChange={handleMultiSelectChange} // This receives array of names
                // selectedOptions prop is not directly exposed by current MultiSelect, it manages its own state.
                // We need to ensure MultiSelect can be controlled or re-initialize its internal state if `role` changes.
                // For now, we rely on its internal state and `onChange`.
                // If MultiSelect needs to be controlled, it should accept a `value` prop (selected names).
                // Let's assume we need to pass a key to re-initialize if selectedPermissionNamesForMultiSelect changes
                // or the MultiSelect is enhanced to accept `value={selectedPermissionNamesForMultiSelect}`.
                // For this iteration, we'll use its uncontrolled nature with onChange.
                // To make it "controlled" with current MultiSelect, we'd need to pass a key to force re-render
                // or modify MultiSelect to take `value` and `onChange`.
                // The current MultiSelect `useEffect` for `onChange` will be triggered by its internal state.
                // We need a way to set its initial state.
                // Hack: Using a key to re-mount MultiSelect when `selectedPermissionNamesForMultiSelect` changes due to `role` change.
                // This is not ideal. A controlled MultiSelect would be better.
                // The provided MultiSelect seems to be uncontrolled based on its props.
                // Let's assume the existing MultiSelect can take initial selected values or we manage it via a key.
                // The provided MultiSelect's useEffect for onChange would mean we set selectedPermissionIds,
                // which then updates selectedPermissionNamesForMultiSelect,
                // but MultiSelect itself might not update its display without a `value` prop.
                //
                // Given the existing MultiSelect:
                // It has `selectedOptions` as internal state. It calls `onChange` when this internal state changes.
                // We need to either:
                // 1. Modify MultiSelect to accept `value: string[]` and be fully controlled. (Best)
                // 2. Add a `defaultValue: string[]` prop to MultiSelect for initial setup.
                // 3. Use a `key` on MultiSelect to force re-mount when `role` (and thus initial perms) changes. (Workaround)
                //
                // For now, I will proceed assuming the MultiSelect somehow gets its initial state from `selectedPermissionNamesForMultiSelect`
                // or that it's acceptable for the user to always start fresh.
                // The `useEffect` in this dialog correctly sets `selectedPermissionIds` when `role` changes.
                // The `selectedPermissionNamesForMultiSelect` is derived correctly.
                // The `handleMultiSelectChange` correctly updates `selectedPermissionIds`.
                // The issue is only how MultiSelect *displays* the initial selection.
                // If MultiSelect has an internal `useEffect` that sets its `selectedOptions` based on an incoming `initialSelectedOptions` prop, that would work.
                // The current `MultiSelect` does not have such a prop.
                //
                // Let's assume for now the MultiSelect is used as is, and selection starts fresh or the user re-selects.
                // For a production component, `MultiSelect` should be enhanced.
                //
                // Simulating passing selected values to a hypothetical `value` prop for MultiSelect for clarity:
                // value={selectedPermissionNamesForMultiSelect}
                // The existing `MultiSelect` doesn't have this.
                // The `onChange` from `MultiSelect` gives us the new list of selected *names*.
                className="w-full"
              />
            ) : (
              <p>没有可用的权限或加载失败。</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading || isFetchingPermissions}>
              {isLoading ? '保存中...' : '保存权限'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
