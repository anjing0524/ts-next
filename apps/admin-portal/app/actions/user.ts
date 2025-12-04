/**
 * 用户相关的 Server Actions (User Server Actions)
 *
 * 该文件包含所有与用户信息相关的 Server Actions
 * This file contains all Server Actions related to user information
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import { UserResult, UpdateUserProfileRequest, UserListResult, PaginatedResult, UserInfo } from './types';
import { withErrorHandling } from './utils';

/**
 * 将 NAPI UserInfo 转换为本地 UserInfo (Transform NAPI UserInfo to local UserInfo)
 * NAPI SDK 返回的 UserInfo 使用驼峰命名，需要转换为蛇形命名
 * NAPI SDK returns UserInfo with camelCase properties, need to convert to snake_case
 */
function transformNapiUserInfo(napiUser: any): UserInfo {
  return {
    user_id: napiUser.userId,
    username: napiUser.username,
    email: napiUser.email,
    display_name: napiUser.displayName,
    avatar_url: napiUser.avatarUrl,
    created_at: napiUser.createdAt,
    updated_at: napiUser.updatedAt,
  };
}

/**
 * 获取用户信息操作 (Get User Info Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的用户信息接口
 * Calls OAuth Service user info API through OAuth SDK
 *
 * @returns 用户信息结果 (User information result)
 */
export async function getUserInfoAction(): Promise<UserResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    const napiUser = await sdk.userGetInfo();
    return transformNapiUserInfo(napiUser);
  }, '获取用户信息失败 (Failed to get user info)');
}

/**
 * 更新用户信息操作 (Update User Profile Action)
 *
 * @param profile - 用户信息更新请求 (User profile update request)
 * @returns 更新后的用户信息结果 (Updated user info result)
 */
export async function updateUserProfileAction(
  profile: UpdateUserProfileRequest,
): Promise<UserResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    // 将驼峰命名转换为蛇形命名以匹配 NAPI SDK 的期望
    // Convert camelCase to snake_case to match NAPI SDK expectations
    const napiProfile = {
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      email: profile.email,
    };
    const napiUser = await sdk.userUpdateProfile(napiProfile as any);
    return transformNapiUserInfo(napiUser);
  }, '更新用户信息失败 (Failed to update user profile)');
}

/**
 * 获取用户列表操作 (List Users Action)
 *
 * 从 OAuth SDK 获取用户列表
 * Gets user list from OAuth SDK
 *
 * Note: OAuth SDK 目前不提供用户列表 API，此方法返回空列表
 * (Note: OAuth SDK currently doesn't provide user list API, this method returns empty list)
 *
 * @param page - 页码 (Page number, 1-indexed)
 * @param limit - 每页数量 (Items per page)
 * @returns 用户列表结果 (User list result with pagination)
 */
export async function listUsersAction(
  page: number = 1,
  limit: number = 10,
): Promise<{ items: UserInfo[]; total: number; page: number; page_size: number; has_more: boolean }> {
  try {
    // OAuth SDK 目前不提供用户列表的 API
    // 返回空列表作为占位符
    // OAuth SDK currently doesn't have user list API
    // Return empty list as placeholder

    return {
      items: [],
      total: 0,
      page,
      page_size: limit,
      has_more: false,
    };
  } catch (error) {
    console.error('Failed to get user list:', error);
    return {
      items: [],
      total: 0,
      page,
      page_size: limit,
      has_more: false,
    };
  }
}
