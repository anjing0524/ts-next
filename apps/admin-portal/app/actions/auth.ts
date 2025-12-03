/**
 * 认证相关的 Server Actions (Authentication Server Actions)
 *
 * 该文件包含所有与用户认证相关的 Server Actions
 * This file contains all Server Actions related to user authentication
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

/**
 * 登录输入参数 (Login Input Parameters)
 */
export interface LoginInput {
  username: string;
  password: string;
}

/**
 * 登录结果 (Login Result)
 */
export interface LoginResult {
  success: boolean;
  data?: {
    session_token: string;
    user_id: string;
    username: string;
    expires_in: number;
  };
  error?: string;
}

/**
 * 登录操作 (Login Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的登录接口
 * Calls OAuth Service login API through OAuth SDK
 *
 * @param credentials - 登录凭证 (Login credentials)
 * @returns 登录结果 (Login result)
 */
export async function loginAction(credentials: LoginInput): Promise<LoginResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.authLogin(credentials.username, credentials.password);

    return {
      success: true,
      data: result as any,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/**
 * 登出操作 (Logout Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的登出接口
 * Calls OAuth Service logout API through OAuth SDK
 *
 * @returns 登出结果 (Logout result)
 */
export async function logoutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const sdk = getOAuthSDK();
    const success = await sdk.authLogout();
    return { success };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Logout failed',
    };
  }
}
