/**
 * 审计日志相关的 Server Actions (Audit Log Server Actions)
 *
 * 该文件包含所有与审计日志查询相关的 Server Actions
 * This file contains all Server Actions related to audit log queries
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import { AuditLogListResult, PaginationParams } from './types';
import { withErrorHandling, validatePaginationParams, extractPaginatedData } from './utils';

/**
 * 获取所有审计日志操作 (Get All Audit Logs Action)
 *
 * @param params - 分页参数 (Pagination parameters)
 * @returns 审计日志列表结果 (Audit logs list result)
 */
export async function listAuditLogsAction(params?: PaginationParams): Promise<AuditLogListResult> {
  return withErrorHandling(async () => {
    const { page, page_size } = validatePaginationParams(params?.page, params?.page_size);
    const sdk = getOAuthSDK();
    const result = await sdk.auditGetLogs(page, page_size);

    return extractPaginatedData(result);
  }, '获取审计日志失败 (Failed to get audit logs)');
}

/**
 * 获取用户的审计日志操作 (Get User Audit Logs Action)
 *
 * @param userId - 用户 ID (User ID)
 * @param params - 分页参数 (Pagination parameters)
 * @returns 用户审计日志列表结果 (User audit logs list result)
 */
export async function listUserAuditLogsAction(
  userId: string,
  params?: PaginationParams,
): Promise<AuditLogListResult> {
  return withErrorHandling(async () => {
    const { page, page_size } = validatePaginationParams(params?.page, params?.page_size);
    const sdk = getOAuthSDK();
    const result = await sdk.auditGetUserLogs(userId, page, page_size);

    return extractPaginatedData(result);
  }, '获取用户审计日志失败 (Failed to get user audit logs)');
}
