/**
 * OAuth2 错误类型枚举
 * 符合 RFC 6749 OAuth 2.0 规范
 * @author 认证团队
 * @since 1.0.0
 */

/**
 * OAuth2 错误类型枚举
 * 符合 RFC 6749 OAuth 2.0 规范
 */
export enum OAuth2ErrorTypes {
  INVALID_REQUEST = 'invalid_request',
  INVALID_CLIENT = 'invalid_client',
  INVALID_GRANT = 'invalid_grant',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE = 'unsupported_grant_type',
  INVALID_SCOPE = 'invalid_scope',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  ACCESS_DENIED = 'access_denied',
}

/**
 * OAuth2 错误响应接口
 */
export interface OAuth2ErrorResponse {
  error: OAuth2ErrorTypes;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

/**
 * 创建标准的OAuth2错误响应
 * 
 * @param error - 错误类型
 * @param description - 错误描述
 * @param uri - 错误详情URI
 * @param state - 状态参数
 * @returns OAuth2错误响应
 */
export function createOAuth2ErrorResponse(
  error: OAuth2ErrorTypes,
  description?: string,
  uri?: string,
  state?: string
): OAuth2ErrorResponse {
  const response: OAuth2ErrorResponse = { error };
  
  if (description) {
    response.error_description = description;
  }
  
  if (uri) {
    response.error_uri = uri;
  }
  
  if (state) {
    response.state = state;
  }
  
  return response;
} 