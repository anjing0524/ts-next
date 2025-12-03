/**
 * 客户端相关的 Server Actions (Client Server Actions)
 *
 * 该文件包含所有与 OAuth 客户端管理相关的 Server Actions
 * This file contains all Server Actions related to OAuth client management
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import {
  ClientListResult,
  ClientResult,
  CreateClientRequest,
  PaginationParams,
} from './types';
import { withErrorHandling, validatePaginationParams, extractPaginatedData } from './utils';

/**
 * 获取客户端列表操作 (Get Client List Action)
 *
 * @param params - 分页参数 (Pagination parameters)
 * @returns 客户端列表结果 (Client list result)
 */
export async function listClientsAction(params?: PaginationParams): Promise<ClientListResult> {
  return withErrorHandling(async () => {
    const { page, page_size } = validatePaginationParams(params?.page, params?.page_size);
    const sdk = getOAuthSDK();
    const result = await sdk.clientList(page, page_size);

    return extractPaginatedData(result);
  }, '获取客户端列表失败 (Failed to get client list)');
}

/**
 * 获取客户端详情操作 (Get Client Details Action)
 *
 * @param clientId - 客户端 ID (Client ID)
 * @returns 客户端详情结果 (Client details result)
 */
export async function getClientAction(clientId: string): Promise<ClientResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    return await sdk.clientGet(clientId);
  }, '获取客户端详情失败 (Failed to get client details)');
}
