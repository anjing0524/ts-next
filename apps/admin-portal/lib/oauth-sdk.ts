/**
 * OAuth SDK 初始化模块 (OAuth SDK Initialization Module)
 *
 * 该模块负责初始化和提供 OAuth Service 的 Rust napi SDK 访问
 * This module is responsible for initializing and providing access to the OAuth Service Rust napi SDK
 */

import type { OAuthSDK, SDKConfig } from 'oauth-service-napi';
import { createSDK } from 'oauth-service-napi';

/**
 * SDK 配置 (SDK Configuration)
 * 从环境变量中读取配置
 * Configuration is read from environment variables
 */
const sdkConfig: SDKConfig = {
  base_url: process.env.OAUTH_SERVICE_URL || 'http://localhost:8080',
  timeout: parseInt(process.env.OAUTH_SDK_TIMEOUT || '5000'),
  retry_count: parseInt(process.env.OAUTH_SDK_RETRY_COUNT || '3'),
  debug: process.env.NODE_ENV === 'development',
};

/**
 * SDK 单例实例 (SDK Singleton Instance)
 */
let sdkInstance: OAuthSDK | null = null;

/**
 * 初始化 OAuth SDK (Initialize OAuth SDK)
 * 仅在服务器端运行
 * Only runs on the server side
 */
export function initializeOAuthSDK(): void {
  if (typeof window === 'undefined') {
    sdkInstance = createSDK(sdkConfig);
  }
}

/**
 * 获取 OAuth SDK 实例 (Get OAuth SDK Instance)
 * 用于 Server Actions 中调用 OAuth Service API
 * Used to call OAuth Service API from Server Actions
 *
 * @throws {Error} 如果在客户端调用 (If called from client side)
 * @throws {Error} 如果 SDK 初始化失败 (If SDK initialization fails)
 * @returns {OAuthSDK} SDK 实例 (SDK instance)
 */
export function getOAuthSDK(): OAuthSDK {
  if (typeof window !== 'undefined') {
    throw new Error('OAuth SDK can only be used on the server side');
  }
  if (!sdkInstance) {
    initializeOAuthSDK();
  }
  if (!sdkInstance) {
    throw new Error('Failed to initialize OAuth SDK');
  }
  return sdkInstance;
}

export type { OAuthSDK, SDKConfig };
