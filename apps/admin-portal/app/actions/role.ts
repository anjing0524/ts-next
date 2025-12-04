/**
 * 角色权限相关的 Server Actions (Role & Permission Server Actions)
 *
 * 该文件包含所有与角色和权限管理相关的 Server Actions
 * This file contains all Server Actions related to role and permission management
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import {
  PermissionListResult,
  RoleListResult,
  UserRoleResult,
  PaginationParams,
} from './types';
import { withErrorHandling, validatePaginationParams, extractPaginatedData } from './utils';

/**
 * 获取权限列表操作 (Get Permissions List Action)
 *
 * @param params - 分页参数 (Pagination parameters)
 * @returns 权限列表结果 (Permissions list result)
 */
export async function listPermissionsAction(params?: PaginationParams): Promise<PermissionListResult> {
  return withErrorHandling(async () => {
    const { page, page_size } = validatePaginationParams(params?.page, params?.page_size);
    const sdk = getOAuthSDK();
    const result = await sdk.rbacGetPermissions(page, page_size);

    return extractPaginatedData(result);
  }, '获取权限列表失败 (Failed to get permissions list)');
}

/**
 * 获取角色列表操作 (Get Roles List Action)
 *
 * @param params - 分页参数 (Pagination parameters)
 * @returns 角色列表结果 (Roles list result)
 */
export async function listRolesAction(params?: PaginationParams): Promise<RoleListResult> {
  return withErrorHandling(async () => {
    const { page, page_size } = validatePaginationParams(params?.page, params?.page_size);
    const sdk = getOAuthSDK();
    const result = await sdk.rbacGetRoles(page, page_size);

    return extractPaginatedData(result);
  }, '获取角色列表失败 (Failed to get roles list)');
}

/**
 * 为用户分配角色操作 (Assign Role to User Action)
 *
 * @param userId - 用户 ID (User ID)
 * @param roleId - 角色 ID (Role ID)
 * @returns 分配结果 (Assignment result)
 */
export async function assignRoleToUserAction(userId: string, roleId: string): Promise<UserRoleResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    const result = await sdk.rbacAssignRole(userId, roleId);

    return result as any;
  }, '分配角色失败 (Failed to assign role)');
}

/**
 * 撤销用户角色操作 (Revoke Role from User Action)
 *
 * @param userId - 用户 ID (User ID)
 * @param roleId - 角色 ID (Role ID)
 * @returns 撤销操作的成功/失败状态
 */
export async function revokeRoleFromUserAction(
  userId: string,
  roleId: string,
): Promise<{ success: boolean; error?: string }> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    const success = await sdk.rbacRevokeRole(userId, roleId);
    return success;
  }, '撤销角色失败 (Failed to revoke role)').then((result) => ({
    success: result.success,
    error: result.error,
  }));
}
