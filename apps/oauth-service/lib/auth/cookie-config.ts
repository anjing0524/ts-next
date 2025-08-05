/**
 * Cookie安全配置工具
 * 提供统一的Cookie安全配置
 */

export interface CookieConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  maxAge: number;
  path: string;
}

/**
 * 获取Cookie安全配置
 * 根据环境变量和当前环境返回适当的配置
 */
export function getCookieConfig(): CookieConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // 从环境变量读取配置，使用合理的默认值
  const secure = process.env.COOKIE_SECURE 
    ? process.env.COOKIE_SECURE === 'true'
    : isProduction; // 生产环境默认启用Secure
    
  const sameSite = validateSameSite(
    process.env.COOKIE_SAMESITE || 'Lax'
  );
  
  const maxAge = parseInt(process.env.COOKIE_MAX_AGE || '3600', 10);
  if (isNaN(maxAge) || maxAge <= 0) {
    throw new Error('Invalid maxAge value');
  }
  
  return {
    httpOnly: true, // 始终启用HttpOnly
    secure,
    sameSite,
    maxAge,
    path: '/',
  };
}

/**
 * 验证SameSite值的有效性
 */
function validateSameSite(value: string): 'Strict' | 'Lax' | 'None' {
  const validValues: Array<'Strict' | 'Lax' | 'None'> = ['Strict', 'Lax', 'None'];
  if (!validValues.includes(value as any)) {
    throw new Error(`Invalid SameSite value: ${value}. Must be one of: ${validValues.join(', ')}`);
  }
  return value as 'Strict' | 'Lax' | 'None';
}

/**
 * 获取访问令牌的Cookie配置
 */
export function getAccessTokenCookieConfig(): CookieConfig {
  return {
    ...getCookieConfig(),
    maxAge: parseInt(process.env.ACCESS_TOKEN_MAX_AGE || '3600', 10),
  };
}

/**
 * 获取刷新令牌的Cookie配置
 */
export function getRefreshTokenCookieConfig(): CookieConfig {
  return {
    ...getCookieConfig(),
    maxAge: parseInt(process.env.REFRESH_TOKEN_MAX_AGE || '2592000', 10), // 30天
  };
}

/**
 * 获取会话Cookie配置（浏览器关闭时过期）
 */
export function getSessionCookieConfig(): Omit<CookieConfig, 'maxAge'> {
  const baseConfig = getCookieConfig();
  const { ...sessionConfig } = baseConfig;
  return sessionConfig;
}