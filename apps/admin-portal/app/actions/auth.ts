/**
 * 认证相关的 Server Actions (Authentication Server Actions)
 *
 * 该文件包含所有与用户认证相关的 Server Actions
 * This file contains all Server Actions related to user authentication
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import { LoginInput, LoginResult, TokenRefreshResult, TokenIntrospectResult } from './types';
import { withErrorHandling } from './utils';

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
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    return await sdk.authLogin(credentials.username, credentials.password);
  }, '登录失败 (Login failed)').then((result) => result as LoginResult);
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
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    const success = await sdk.authLogout();
    return success;
  }, '登出失败 (Logout failed)').then((result) => ({
    success: result.success,
    error: result.error,
  }));
}

/**
 * 刷新访问令牌操作 (Refresh Token Action)
 *
 * @param refreshToken - 刷新令牌 (Refresh token)
 * @returns 新的令牌对结果 (New token pair result)
 */
export async function refreshTokenAction(refreshToken: string): Promise<TokenRefreshResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    return await sdk.tokenRefresh(refreshToken);
  }, '刷新令牌失败 (Failed to refresh token)').then((result) => result as TokenRefreshResult);
}

/**
 * 验证令牌操作 (Introspect Token Action)
 *
 * @param token - 要验证的令牌 (Token to introspect)
 * @returns 令牌信息结果 (Token info result)
 */
export async function introspectTokenAction(token: string): Promise<TokenIntrospectResult> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    return await sdk.tokenIntrospect(token);
  }, '验证令牌失败 (Failed to introspect token)').then((result) => result as TokenIntrospectResult);
}

/**
 * 撤销令牌操作 (Revoke Token Action)
 *
 * @param token - 要撤销的令牌 (Token to revoke)
 * @returns 撤销操作的成功/失败状态
 */
export async function revokeTokenAction(token: string): Promise<{ success: boolean; error?: string }> {
  return withErrorHandling(async () => {
    const sdk = getOAuthSDK();
    const success = await sdk.tokenRevoke(token);
    return success;
  }, '撤销令牌失败 (Failed to revoke token)').then((result) => ({
    success: result.success,
    error: result.error,
  }));
}
