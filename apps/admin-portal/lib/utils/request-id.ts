/**
 * 请求ID生成和管理
 * 用于追踪请求在整个系统中的流转
 */

import * as Sentry from '@sentry/nextjs';

/**
 * 生成唯一的请求ID
 * 格式：[时间戳]-[随机数]
 * 用于追踪请求在整个系统中的流转
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36); // 时间戳的36进制表示（更短）
  const randomPart = Math.random().toString(36).substring(2, 11); // 9位随机字符

  return `${timestamp}-${randomPart}`;
}

/**
 * 获取当前请求ID上下文
 * （在Node.js环境中使用异步本地存储实现）
 */
let currentRequestId: string | null = null;

/**
 * 设置当前请求ID
 */
export function setCurrentRequestId(requestId: string): void {
  currentRequestId = requestId;
  // 同时设置到Sentry的标签中
  Sentry.setTag('requestId', requestId);
}

/**
 * 获取当前请求ID
 */
export function getCurrentRequestId(): string | null {
  return currentRequestId;
}

/**
 * 清除当前请求ID
 */
export function clearCurrentRequestId(): void {
  currentRequestId = null;
}
