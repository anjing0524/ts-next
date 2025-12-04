/**
 * 用户相关的 Server Actions (User Server Actions)
 *
 * 该文件包含所有与用户信息相关的 Server Actions
 * This file contains all Server Actions related to user information
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import { UserResult, UpdateUserProfileRequest } from './types';
import { withErrorHandling } from './utils';

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
    return await sdk.userGetInfo();
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
    return await sdk.userUpdateProfile(profile as any);
  }, '更新用户信息失败 (Failed to update user profile)');
}
