// lib/errors.ts
/**
 * @fileoverview 定义了认证授权系统中使用的自定义错误类。
 * (Defines custom error classes used in the authentication and authorization system.)
 * @author 开发团队 (Development Team)
 * @since 1.0.0
 * @see docs/工具函数规范.md Section 5.1
 */

import { ApiError, ApiResponse } from './types/api'; // 导入API错误和响应类型 (Import API error and response types)

/**
 * @enum {string}
 * OAuth 2.0 错误代码枚举 (OAuth 2.0 Error Code Enumeration)
 * 这些错误代码遵循 RFC 6749 (OAuth 2.0) 和 RFC 6750 (Bearer Token Usage) 中定义的标准。
 * (These error codes follow the standards defined in RFC 6749 (OAuth 2.0) and RFC 6750 (Bearer Token Usage).)
 */
export enum OAuth2ErrorCode {
  /**
   * 请求无效 (Invalid Request)
   * 请求缺少必需的参数、包含不支持的参数值（授权类型除外）、重复参数、
   * 包含多个凭据、使用多种机制对客户端进行身份验证，或格式错误。
   * (The request is missing a required parameter, includes an unsupported parameter value (other than grant type),
   * repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.)
   */
  InvalidRequest = 'invalid_request',

  /**
   * 客户端无效 (Invalid Client)
   * 客户端身份验证失败（例如，未知的客户端、未包含客户端身份验证，或不支持的身份验证方法）。
   * 授权服务器可以返回 HTTP 401（Unauthorized）状态码。
   * (Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method).
   * The authorization server MAY return an HTTP 401 (Unauthorized) status code.)
   */
  InvalidClient = 'invalid_client',

  /**
   * 授权许可无效 (Invalid Grant)
   * 提供的授权许可（例如，授权码、资源所有者凭据）或刷新令牌无效、已过期、已撤销、
   * 与授权请求中使用的重定向URI不匹配，或者颁发给了其他客户端。
   * (The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is
   * invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.)
   */
  InvalidGrant = 'invalid_grant',

  /**
   * 未经授权的客户端 (Unauthorized Client)
   * 经过身份验证的客户端无权使用此授权许可类型。
   * (The authenticated client is not authorized to use this authorization grant type.)
   */
  UnauthorizedClient = 'unauthorized_client',

  /**
   * 不支持的授权类型 (Unsupported Grant Type)
   * 授权服务器不支持此授权许可类型。
   * (The authorization grant type is not supported by the authorization server.)
   */
  UnsupportedGrantType = 'unsupported_grant_type',

  /**
   * 无效的范围 (Invalid Scope)
   * 请求的范围无效、未知、格式错误或超出了资源所有者授予的范围。
   * (The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.)
   */
  InvalidScope = 'invalid_scope',

  /**
   * 访问被拒绝 (Access Denied)
   * 资源所有者或授权服务器拒绝了该请求。
   * (The resource owner or authorization server denied the request.)
   */
  AccessDenied = 'access_denied',

  /**
   * 不支持的响应类型 (Unsupported Response Type)
   * 授权服务器不支持使用此方法获取授权码。
   * (The authorization server does not support obtaining an authorization code using this method.)
   */
  UnsupportedResponseType = 'unsupported_response_type',

  /**
   * 服务器错误 (Server Error)
   * 授权服务器遇到了意外情况，导致无法完成请求。 (HTTP 500 Internal Server Error)
   * (The authorization server encountered an unexpected condition that prevented it from fulfilling the request.)
   */
  ServerError = 'server_error',

  /**
   * 暂时不可用 (Temporarily Unavailable)
   * 由于服务器临时过载或维护，授权服务器当前无法处理该请求。 (HTTP 503 Service Unavailable)
   * (The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server.)
   */
  TemporarilyUnavailable = 'temporarily_unavailable',

  /**
   * 令牌无效 (Invalid Token) - RFC 6750
   * 提供的访问令牌已过期、已撤销、格式错误或因其他原因无效。
   * (The access token provided is expired, revoked, malformed, or invalid for other reasons.)
   */
  InvalidToken = 'invalid_token',

  /**
   * 权限不足 (Insufficient Scope) - RFC 6750
   * 请求需要比访问令牌授予的范围更高的权限。
   * (The request requires higher privileges than provided by the access token.)
   */
  InsufficientScope = 'insufficient_scope',
}


/**
 * 基础错误类 (Base Error Class)
 * 所有自定义错误的基类，提供了标准化的错误处理方式。
 * (Base class for all custom errors, providing a standardized way of handling errors.)
 */
export abstract class BaseError extends Error {
  /** HTTP状态码 (HTTP status code) */
  public readonly status: number;
  /** 错误代码 (Error code) */
  public readonly code: string;
  /** 错误的附加上下文信息 (Additional contextual information for the error) */
  public readonly context?: Record<string, any>;

  /**
   * 构造一个新的 BaseError 实例。
   * (Constructs a new BaseError instance.)
   * @param message 错误消息，供人类阅读。 (Error message, human-readable.)
   * @param status HTTP 状态码，默认为 500。 (HTTP status code, defaults to 500.)
   * @param code 应用特定的错误代码。 (Application-specific error code.)
   * @param context 可选的附加上下文数据。 (Optional additional contextual data.)
   */
  constructor(message: string, status: number = 500, code: string = 'INTERNAL_SERVER_ERROR', context?: Record<string, any>) {
    super(message); // 调用 Error 类的构造函数 (Call the constructor of the Error class)
    this.name = this.constructor.name; // 设置错误名称为类名 (Set the error name to the class name)
    this.status = status;
    this.code = code;
    this.context = context;
    // Object.setPrototypeOf(this, new.target.prototype); // 确保 instanceof 能正常工作 (Ensure instanceof works correctly)
  }

  /**
   * 将错误对象转换为标准化的 API 响应格式。
   * (Converts the error object to a standardized API response format.)
   * @returns ApiResponse 对象，其中 success 为 false，并包含错误信息。
   * (Returns an ApiResponse object with success as false and containing error information.)
   */
  public toApiResponse(): ApiResponse<never> {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.context, // 使用 'details' 而不是 'context' 以符合 ApiError 接口的新规范
                               // Use 'details' instead of 'context' to align with new ApiError interface spec
      },
    };
  }

  /**
   * 将错误信息记录到日志。
   * (Logs the error information.)
   * @param logger 可选的日志记录器实例，默认为 console。 (Optional logger instance, defaults to console.)
   * @param additionalContext 可选的额外上下文信息，用于丰富日志。 (Optional additional context for richer logs.)
   */
  public log(logger: Pick<Console, 'error'> = console, additionalContext?: Record<string, any>): void {
    logger.error({
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      context: this.context,
      additionalContext,
      stack: this.stack,
    });
  }
}

/**
 * 验证错误 (Validation Error)
 * 表示输入数据验证失败。
 * (Indicates that input data validation failed.)
 */
export class ValidationError extends BaseError {
  constructor(message: string = 'Validation failed.', context?: Record<string, any>, code: string = 'VALIDATION_ERROR') {
    super(message, 400, code, context); // HTTP 400 Bad Request (HTTP 400 Bad Request)
  }
}

/**
 * 认证错误 (Authentication Error)
 * 表示用户认证失败（例如，无效的凭据、缺失令牌）。
 * (Indicates user authentication failure (e.g., invalid credentials, missing token).)
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed.', context?: Record<string, any>, code: string = 'AUTHENTICATION_FAILED') {
    super(message, 401, code, context); // HTTP 401 Unauthorized (HTTP 401 Unauthorized)
  }
}

/**
 * 授权错误 (Authorization Error)
 * 表示用户已认证但无权访问所请求的资源。
 * (Indicates that the user is authenticated but not authorized to access the requested resource.)
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = 'Forbidden.', context?: Record<string, any>, code: string = 'AUTHORIZATION_FAILED') {
    super(message, 403, code, context); // HTTP 403 Forbidden (HTTP 403 Forbidden)
  }
}

/**
 * 令牌相关错误基类 (Base class for token-related errors)
 * 用于更细致地区分与令牌操作相关的错误。
 * (Used for more granular distinction of errors related to token operations.)
 */
export abstract class TokenError extends BaseError {
  constructor(message: string, status: number = 400, code: string = 'TOKEN_ERROR', context?: Record<string, any>) {
    super(message, status, code, context);
  }
}

/**
 * 令牌生成错误 (Token Generation Error)
 * 表示在尝试创建令牌（如JWT）时发生错误。
 * (Indicates an error occurred while trying to create a token (e.g., JWT).)
 */
export class TokenGenerationError extends TokenError {
  constructor(message: string = 'Token generation failed.', context?: Record<string, any>) {
    super(message, 500, 'TOKEN_GENERATION_FAILED', context); // 通常是服务器内部问题 (Usually an internal server issue)
  }
}

/**
 * 令牌验证错误 (Token Validation Error)
 * 表示提供的令牌无效（例如，签名错误、格式错误）。
 * (Indicates that a provided token is invalid (e.g., signature error, malformed).)
 */
export class TokenValidationError extends TokenError {
  constructor(message: string = 'Token validation failed.', context?: Record<string, any>, code: string = 'TOKEN_VALIDATION_FAILED') {
    super(message, 401, code, context); // 通常导致未授权访问 (Usually results in unauthorized access)
  }
}

/**
 * 令牌过期错误 (Token Expired Error)
 * 表示提供的令牌已过其有效期。
 * (Indicates that a provided token has passed its expiration time.)
 */
export class TokenExpiredError extends TokenValidationError { // 继承自 TokenValidationError (Inherits from TokenValidationError)
  constructor(message: string = 'Token has expired.', context?: Record<string, any>) {
    super(message, context, 'TOKEN_EXPIRED'); // 状态码仍为401 (Status code remains 401)
  }
}

/**
 * 令牌撤销错误 (Token Revocation Error)
 * 表示在尝试撤销令牌时发生错误，或者令牌已被撤销。
 * (Indicates an error occurred while trying to revoke a token, or the token was already revoked.)
 */
export class TokenRevocationError extends TokenError {
  constructor(message: string = 'Token revocation operation failed or token already revoked.', context?: Record<string, any>) {
    super(message, 400, 'TOKEN_REVOCATION_ERROR', context); // 可以是400或特定场景下的其他代码 (Can be 400 or other codes depending on context)
  }
}

/**
 * 加密操作错误 (Cryptography Error)
 * 表示在执行加密或解密操作（如哈希、签名验证）时发生错误。
 * (Indicates an error occurred during cryptographic operations (e.g., hashing, signature verification).)
 */
export class CryptoError extends BaseError {
  constructor(message: string = 'Cryptographic operation failed.', context?: Record<string, any>) {
    super(message, 500, 'CRYPTO_OPERATION_FAILED', context); // 通常是服务器内部问题 (Usually an internal server issue)
  }
}

/**
 * 配置错误 (Configuration Error)
 * 表示系统配置存在问题（例如，缺少必要的环境变量）。
 * (Indicates a problem with system configuration (e.g., missing essential environment variables).)
 */
export class ConfigurationError extends BaseError {
  constructor(message: string = 'System configuration error.', context?: Record<string, any>) {
    super(message, 500, 'CONFIGURATION_ERROR', context); // 通常是服务器内部问题，阻止正常运行 (Usually an internal server issue preventing normal operation)
  }
}

/**
 * OAuth 2.0 特定错误 (OAuth 2.0 Specific Error)
 * 用于表示符合 OAuth 2.0 规范中定义的错误。
 * (Used to represent errors defined in the OAuth 2.0 specification.)
 */
export class OAuth2Error extends BaseError {
  /** OAuth 2.0 标准错误代码 (OAuth 2.0 standard error code) */
  public readonly oauth2ErrorCode: OAuth2ErrorCode;
  /** (可选) 错误URI，指向包含更多错误信息的页面 (Optional error URI, pointing to a page with more error information) */
  public readonly errorUri?: string;

  /**
   * 构造一个新的 OAuth2Error 实例。
   * (Constructs a new OAuth2Error instance.)
   * @param message 错误描述。 (Error description.)
   * @param oauth2ErrorCode 符合 OAuth 2.0 规范的错误代码。 (OAuth 2.0 specification compliant error code.)
   * @param status HTTP 状态码。 (HTTP status code.)
   * @param errorUri 可选的错误 URI。 (Optional error URI.)
   * @param context 可选的附加上下文数据。 (Optional additional contextual data.)
   */
  constructor(
    message: string,
    oauth2ErrorCode: OAuth2ErrorCode,
    status: number = 400, // OAuth错误通常是400或401 (OAuth errors are typically 400 or 401)
    errorUri?: string,
    context?: Record<string, any>
  ) {
    super(message, status, oauth2ErrorCode, context); // 使用 oauth2ErrorCode 作为 BaseError 的 'code' (Use oauth2ErrorCode as 'code' for BaseError)
    this.oauth2ErrorCode = oauth2ErrorCode;
    this.errorUri = errorUri;
  }

  /**
   * 将此错误转换为 OAuth 2.0 令牌端点错误响应的格式。
   * (Converts this error to the format for an OAuth 2.0 token endpoint error response.)
   * @returns 包含 `error` 和 `error_description` (及可选的 `error_uri`) 的对象。
   * (Returns an object containing `error`, `error_description`, and optionally `error_uri`.)
   */
  public toOAuth2Response(): { error: string; error_description: string; error_uri?: string } {
    const response: { error: string; error_description: string; error_uri?: string } = {
      error: this.oauth2ErrorCode,
      error_description: this.message,
    };
    if (this.errorUri) {
      response.error_uri = this.errorUri;
    }
    return response;
  }

  /**
   * 覆盖 toApiResponse 方法以包含 OAuth 特定的字段。
   * (Overrides toApiResponse method to include OAuth specific fields.)
   * @returns ApiResponse 对象。 (ApiResponse object.)
   */
  public override toApiResponse(): ApiResponse<never> {
    const baseResponse = super.toApiResponse();
    if (baseResponse.error && this.errorUri) {
      baseResponse.error.details = {
        ...baseResponse.error.details,
        error_uri: this.errorUri,
      };
    }
    return baseResponse;
  }
}
