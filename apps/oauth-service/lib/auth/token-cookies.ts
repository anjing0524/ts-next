import { NextResponse } from 'next/server';
import { CookieSecurityConfig } from './constants';

/**
 * Token Cookie管理工具
 * 用于在OAuth服务端设置和管理认证相关的Cookie
 */

export interface TokenCookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

/**
 * 设置访问令牌的Cookie
 */
export function setAccessTokenCookie(
  response: NextResponse,
  token: string,
  options?: TokenCookieOptions
): NextResponse {
  const config = {
    httpOnly: options?.httpOnly ?? CookieSecurityConfig.HTTP_ONLY,
    secure: options?.secure ?? CookieSecurityConfig.SECURE,
    sameSite: options?.sameSite ?? CookieSecurityConfig.SAME_SITE,
    maxAge: options?.maxAge ?? CookieSecurityConfig.ACCESS_TOKEN_MAX_AGE,
    path: options?.path ?? CookieSecurityConfig.PATH,
    ...(options?.domain && { domain: options.domain }),
  };

  response.cookies.set('access_token', token, config);
  return response;
}

/**
 * 设置刷新令牌的Cookie
 */
export function setRefreshTokenCookie(
  response: NextResponse,
  token: string,
  options?: TokenCookieOptions
): NextResponse {
  const config = {
    httpOnly: options?.httpOnly ?? CookieSecurityConfig.HTTP_ONLY,
    secure: options?.secure ?? CookieSecurityConfig.SECURE,
    sameSite: options?.sameSite ?? CookieSecurityConfig.SAME_SITE,
    maxAge: options?.maxAge ?? CookieSecurityConfig.REFRESH_TOKEN_MAX_AGE,
    path: options?.path ?? CookieSecurityConfig.PATH,
    ...(options?.domain && { domain: options.domain }),
  };

  response.cookies.set('refresh_token', token, config);
  return response;
}

/**
 * 清除访问令牌的Cookie
 */
export function clearAccessTokenCookie(
  response: NextResponse,
  options?: Pick<TokenCookieOptions, 'path' | 'domain'>
): NextResponse {
  response.cookies.set('access_token', '', {
    httpOnly: true,
    secure: CookieSecurityConfig.SECURE,
    sameSite: CookieSecurityConfig.SAME_SITE,
    maxAge: 0,
    path: options?.path ?? CookieSecurityConfig.PATH,
    ...(options?.domain && { domain: options.domain }),
  });
  return response;
}

/**
 * 清除刷新令牌的Cookie
 */
export function clearRefreshTokenCookie(
  response: NextResponse,
  options?: Pick<TokenCookieOptions, 'path' | 'domain'>
): NextResponse {
  response.cookies.set('refresh_token', '', {
    httpOnly: true,
    secure: CookieSecurityConfig.SECURE,
    sameSite: CookieSecurityConfig.SAME_SITE,
    maxAge: 0,
    path: options?.path ?? CookieSecurityConfig.PATH,
    ...(options?.domain && { domain: options.domain }),
  });
  return response;
}

/**
 * 设置会话Cookie（浏览器关闭时过期）
 */
export function setSessionCookie(
  response: NextResponse,
  name: string,
  value: string,
  options?: Omit<TokenCookieOptions, 'maxAge'>
): NextResponse {
  const config = {
    httpOnly: options?.httpOnly ?? CookieSecurityConfig.HTTP_ONLY,
    secure: options?.secure ?? CookieSecurityConfig.SECURE,
    sameSite: options?.sameSite ?? CookieSecurityConfig.SAME_SITE,
    path: options?.path ?? CookieSecurityConfig.PATH,
    ...(options?.domain && { domain: options.domain }),
  };

  response.cookies.set(name, value, config);
  return response;
}