/**
 * OAuth2 认证授权相关类型定义
 * OAuth2 Authentication & Authorization Type Definitions
 * @author 认证团队
 * @since 1.0.0
 */

import { NextRequest } from 'next/server';

/**
 * 权限上下文接口
 * Permission context interface
 */
export interface AuthContext {
  user: {
    id: string;
    username?: string | null;
    email?: string | null;
    permissions?: string[];
    roles?: string[];
  };
  permissions: string[];
}

/**
 * OAuth2 错误代码枚举
 * OAuth2 error code enumeration
 */
export enum OAuth2ErrorCode {
  InvalidRequest = 'invalid_request',
  InvalidClient = 'invalid_client',
  InvalidGrant = 'invalid_grant',
  UnauthorizedClient = 'unauthorized_client',
  UnsupportedGrantType = 'unsupported_grant_type',
  InvalidScope = 'invalid_scope',
  UnsupportedResponseType = 'unsupported_response_type',
  AccessDenied = 'access_denied',
  ServerError = 'server_error',
  TemporarilyUnavailable = 'temporarily_unavailable',
}

/**
 * 客户端类型枚举
 * Client type enumeration
 */
export enum ClientType {
  PUBLIC = 'public',
  CONFIDENTIAL = 'confidential',
}

/**
 * 授权类型枚举
 * Grant type enumeration
 */
export enum GrantType {
  AUTHORIZATION_CODE = 'authorization_code',
  CLIENT_CREDENTIALS = 'client_credentials',
  REFRESH_TOKEN = 'refresh_token',
}

/**
 * 响应类型枚举
 * Response type enumeration
 */
export enum ResponseType {
  CODE = 'code',
}

/**
 * 令牌端点认证方法枚举
 * Token endpoint authentication method enumeration
 */
export enum TokenEndpointAuthMethod {
  NONE = 'none',
  CLIENT_SECRET_BASIC = 'client_secret_basic',
  CLIENT_SECRET_POST = 'client_secret_post',
}

/**
 * 认证请求扩展接口
 * Authenticated request extension interface
 */
export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    userId?: string;
    username?: string;
    clientId?: string;
    permissions?: string[];
    [key: string]: any;
  };
} 