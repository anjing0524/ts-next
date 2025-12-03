/**
 * 用户相关的 Server Actions (User Server Actions)
 *
 * 该文件包含所有与用户信息相关的 Server Actions
 * This file contains all Server Actions related to user information
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

/**
 * 用户信息结果 (User Information Result)
 */
export interface UserResult {
  success: boolean;
  data?: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
  };
  error?: string;
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
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.userGetInfo();

    return {
      success: true,
      data: result as any,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user info',
    };
  }
}
