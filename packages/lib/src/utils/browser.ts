/**
 * 浏览器安全的工具函数
 * 这些函数可以在浏览器环境中安全使用
 */

/**
 * 生成随机字符串
 * @param length 字符串长度
 * @returns 随机字符串
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成PKCE code challenge
 * @param codeVerifier code verifier
 * @returns code challenge
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 生成PKCE code verifier
 * @returns code verifier
 */
export function generateCodeVerifier(): string {
  return generateRandomString(128);
}

/**
 * 生成OAuth state参数
 * @returns state字符串
 */
export function generateState(): string {
  return generateRandomString(32);
}

/**
 * 生成OAuth nonce参数
 * @returns nonce字符串
 */
export function generateNonce(): string {
  return generateRandomString(32);
}

/**
 * 安全的URL编码
 * @param str 要编码的字符串
 * @returns 编码后的字符串
 */
export function safeUrlEncode(str: string): string {
  return encodeURIComponent(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * 检查字符串是否为空或只包含空白字符
 * @param str 要检查的字符串
 * @returns 是否为空
 */
export function isEmpty(str: string): boolean {
  return !str || str.trim().length === 0;
}

/**
 * 格式化日期为ISO字符串
 * @param date 日期对象
 * @returns 格式化的日期字符串
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * 获取当前时间戳
 * @returns 当前时间戳
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}
