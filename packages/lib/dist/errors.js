"use strict";
// lib/errors.ts
/**
 * @fileoverview 定义了认证授权系统中使用的自定义错误类。
 * (Defines custom error classes used in the authentication and authorization system.)
 * @author 开发团队 (Development Team)
 * @since 1.0.0
 * @see docs/工具函数规范.md Section 5.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuth2Error = exports.ConfigurationError = exports.CryptoError = exports.TokenRevocationError = exports.TokenExpiredError = exports.TokenValidationError = exports.TokenGenerationError = exports.TokenError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.ResourceNotFoundError = exports.BaseError = exports.OAuth2ErrorCode = void 0;
/**
 * @enum {string}
 * OAuth 2.0 错误代码枚举 (OAuth 2.0 Error Code Enumeration)
 * 这些错误代码遵循 RFC 6749 (OAuth 2.0) 和 RFC 6750 (Bearer Token Usage) 中定义的标准。
 * (These error codes follow the standards defined in RFC 6749 (OAuth 2.0) and RFC 6750 (Bearer Token Usage).)
 */
var OAuth2ErrorCode;
(function (OAuth2ErrorCode) {
    /**
     * 请求无效 (Invalid Request)
     * 请求缺少必需的参数、包含不支持的参数值（授权类型除外）、重复参数、
     * 包含多个凭据、使用多种机制对客户端进行身份验证，或格式错误。
     * (The request is missing a required parameter, includes an unsupported parameter value (other than grant type),
     * repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.)
     */
    OAuth2ErrorCode["InvalidRequest"] = "invalid_request";
    /**
     * 客户端无效 (Invalid Client)
     * 客户端身份验证失败（例如，未知的客户端、未包含客户端身份验证，或不支持的身份验证方法）。
     * 授权服务器可以返回 HTTP 401（Unauthorized）状态码。
     * (Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method).
     * The authorization server MAY return an HTTP 401 (Unauthorized) status code.)
     */
    OAuth2ErrorCode["InvalidClient"] = "invalid_client";
    /**
     * 授权许可无效 (Invalid Grant)
     * 提供的授权许可（例如，授权码、资源所有者凭据）或刷新令牌无效、已过期、已撤销、
     * 与授权请求中使用的重定向URI不匹配，或者颁发给了其他客户端。
     * (The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is
     * invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.)
     */
    OAuth2ErrorCode["InvalidGrant"] = "invalid_grant";
    /**
     * 未经授权的客户端 (Unauthorized Client)
     * 经过身份验证的客户端无权使用此授权许可类型。
     * (The authenticated client is not authorized to use this authorization grant type.)
     */
    OAuth2ErrorCode["UnauthorizedClient"] = "unauthorized_client";
    /**
     * 不支持的授权类型 (Unsupported Grant Type)
     * 授权服务器不支持此授权许可类型。
     * (The authorization grant type is not supported by the authorization server.)
     */
    OAuth2ErrorCode["UnsupportedGrantType"] = "unsupported_grant_type";
    /**
     * 无效的范围 (Invalid Scope)
     * 请求的范围无效、未知、格式错误或超出了资源所有者授予的范围。
     * (The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.)
     */
    OAuth2ErrorCode["InvalidScope"] = "invalid_scope";
    /**
     * 访问被拒绝 (Access Denied)
     * 资源所有者或授权服务器拒绝了该请求。
     * (The resource owner or authorization server denied the request.)
     */
    OAuth2ErrorCode["AccessDenied"] = "access_denied";
    /**
     * 不支持的响应类型 (Unsupported Response Type)
     * 授权服务器不支持使用此方法获取授权码。
     * (The authorization server does not support obtaining an authorization code using this method.)
     */
    OAuth2ErrorCode["UnsupportedResponseType"] = "unsupported_response_type";
    /**
     * 服务器错误 (Server Error)
     * 授权服务器遇到了意外情况，导致无法完成请求。 (HTTP 500 Internal Server Error)
     * (The authorization server encountered an unexpected condition that prevented it from fulfilling the request.)
     */
    OAuth2ErrorCode["ServerError"] = "server_error";
    /**
     * 暂时不可用 (Temporarily Unavailable)
     * 由于服务器临时过载或维护，授权服务器当前无法处理该请求。 (HTTP 503 Service Unavailable)
     * (The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server.)
     */
    OAuth2ErrorCode["TemporarilyUnavailable"] = "temporarily_unavailable";
    /**
     * 令牌无效 (Invalid Token) - RFC 6750
     * 提供的访问令牌已过期、已撤销、格式错误或因其他原因无效。
     * (The access token provided is expired, revoked, malformed, or invalid for other reasons.)
     */
    OAuth2ErrorCode["InvalidToken"] = "invalid_token";
    /**
     * 权限不足 (Insufficient Scope) - RFC 6750
     * 请求需要比访问令牌授予的范围更高的权限。
     * (The request requires higher privileges than provided by the access token.)
     */
    OAuth2ErrorCode["InsufficientScope"] = "insufficient_scope";
})(OAuth2ErrorCode || (exports.OAuth2ErrorCode = OAuth2ErrorCode = {}));
/**
 * 基础错误类 (Base Error Class)
 * 所有自定义错误的基类，提供了标准化的错误处理方式。
 * (Base class for all custom errors, providing a standardized way of handling errors.)
 */
class BaseError extends Error {
    /**
     * 构造一个新的 BaseError 实例。
     * (Constructs a new BaseError instance.)
     * @param message 错误消息，供人类阅读。 (Error message, human-readable.)
     * @param status HTTP 状态码，默认为 500。 (HTTP status code, defaults to 500.)
     * @param code 应用特定的错误代码。 (Application-specific error code.)
     * @param context 可选的附加上下文数据。 (Optional additional contextual data.)
     */
    constructor(message, status = 500, code = 'INTERNAL_SERVER_ERROR', context) {
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
    toApiResponse() {
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
    log(logger = console, additionalContext) {
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
exports.BaseError = BaseError;
/**
 * 资源未找到错误 (Resource Not Found Error)
 * 表示请求的资源不存在。
 * (Indicates that the requested resource does not exist.)
 */
class ResourceNotFoundError extends BaseError {
    constructor(message = 'Resource not found.', code = 'RESOURCE_NOT_FOUND', context) {
        super(message, 404, code, context); // HTTP 404 Not Found
    }
}
exports.ResourceNotFoundError = ResourceNotFoundError;
/**
 * 验证错误 (Validation Error)
 * 表示输入数据验证失败。
 * (Indicates that input data validation failed.)
 */
class ValidationError extends BaseError {
    constructor(message = 'Validation failed.', context, code = 'VALIDATION_ERROR') {
        super(message, 400, code, context); // HTTP 400 Bad Request (HTTP 400 Bad Request)
    }
}
exports.ValidationError = ValidationError;
/**
 * 认证错误 (Authentication Error)
 * 表示用户认证失败（例如，无效的凭据、缺失令牌）。
 * (Indicates user authentication failure (e.g., invalid credentials, missing token).)
 */
class AuthenticationError extends BaseError {
    constructor(message = 'Authentication failed.', context, code = 'AUTHENTICATION_FAILED') {
        super(message, 401, code, context); // HTTP 401 Unauthorized (HTTP 401 Unauthorized)
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * 授权错误 (Authorization Error)
 * 表示用户已认证但无权访问所请求的资源。
 * (Indicates that the user is authenticated but not authorized to access the requested resource.)
 */
class AuthorizationError extends BaseError {
    constructor(message = 'Forbidden.', context, code = 'AUTHORIZATION_FAILED') {
        super(message, 403, code, context); // HTTP 403 Forbidden (HTTP 403 Forbidden)
    }
}
exports.AuthorizationError = AuthorizationError;
/**
 * 令牌相关错误基类 (Base class for token-related errors)
 * 用于更细致地区分与令牌操作相关的错误。
 * (Used for more granular distinction of errors related to token operations.)
 */
class TokenError extends BaseError {
    constructor(message, status = 400, code = 'TOKEN_ERROR', context) {
        super(message, status, code, context);
    }
}
exports.TokenError = TokenError;
/**
 * 令牌生成错误 (Token Generation Error)
 * 表示在尝试创建令牌（如JWT）时发生错误。
 * (Indicates an error occurred while trying to create a token (e.g., JWT).)
 */
class TokenGenerationError extends TokenError {
    constructor(message = 'Token generation failed.', context) {
        super(message, 500, 'TOKEN_GENERATION_FAILED', context); // 通常是服务器内部问题 (Usually an internal server issue)
    }
}
exports.TokenGenerationError = TokenGenerationError;
/**
 * 令牌验证错误 (Token Validation Error)
 * 表示提供的令牌无效（例如，签名错误、格式错误）。
 * (Indicates that a provided token is invalid (e.g., signature error, malformed).)
 */
class TokenValidationError extends TokenError {
    constructor(message = 'Token validation failed.', context, code = 'TOKEN_VALIDATION_FAILED') {
        super(message, 401, code, context); // 通常导致未授权访问 (Usually results in unauthorized access)
    }
}
exports.TokenValidationError = TokenValidationError;
/**
 * 令牌过期错误 (Token Expired Error)
 * 表示提供的令牌已过其有效期。
 * (Indicates that a provided token has passed its expiration time.)
 */
class TokenExpiredError extends TokenValidationError {
    constructor(message = 'Token has expired.', context) {
        super(message, context, 'TOKEN_EXPIRED'); // 状态码仍为401 (Status code remains 401)
    }
}
exports.TokenExpiredError = TokenExpiredError;
/**
 * 令牌撤销错误 (Token Revocation Error)
 * 表示在尝试撤销令牌时发生错误，或者令牌已被撤销。
 * (Indicates an error occurred while trying to revoke a token, or the token was already revoked.)
 */
class TokenRevocationError extends TokenError {
    constructor(message = 'Token revocation operation failed or token already revoked.', context) {
        super(message, 400, 'TOKEN_REVOCATION_ERROR', context); // 可以是400或特定场景下的其他代码 (Can be 400 or other codes depending on context)
    }
}
exports.TokenRevocationError = TokenRevocationError;
/**
 * 加密操作错误 (Cryptography Error)
 * 表示在执行加密或解密操作（如哈希、签名验证）时发生错误。
 * (Indicates an error occurred during cryptographic operations (e.g., hashing, signature verification).)
 */
class CryptoError extends BaseError {
    constructor(message = 'Cryptographic operation failed.', context) {
        super(message, 500, 'CRYPTO_OPERATION_FAILED', context); // 通常是服务器内部问题 (Usually an internal server issue)
    }
}
exports.CryptoError = CryptoError;
/**
 * 配置错误 (Configuration Error)
 * 表示系统配置存在问题（例如，缺少必要的环境变量）。
 * (Indicates a problem with system configuration (e.g., missing essential environment variables).)
 */
class ConfigurationError extends BaseError {
    constructor(message = 'System configuration error.', context) {
        super(message, 500, 'CONFIGURATION_ERROR', context); // 通常是服务器内部问题，阻止正常运行 (Usually an internal server issue preventing normal operation)
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * OAuth 2.0 特定错误 (OAuth 2.0 Specific Error)
 * 用于表示符合 OAuth 2.0 规范中定义的错误。
 * (Used to represent errors defined in the OAuth 2.0 specification.)
 */
class OAuth2Error extends BaseError {
    /**
     * 构造一个新的 OAuth2Error 实例。
     * (Constructs a new OAuth2Error instance.)
     * @param message 错误描述。 (Error description.)
     * @param oauth2ErrorCode 符合 OAuth 2.0 规范的错误代码。 (OAuth 2.0 specification compliant error code.)
     * @param status HTTP 状态码。 (HTTP status code.)
     * @param errorUri 可选的错误 URI。 (Optional error URI.)
     * @param context 可选的附加上下文数据。 (Optional additional contextual data.)
     */
    constructor(message, oauth2ErrorCode, status = 400, // OAuth错误通常是400或401 (OAuth errors are typically 400 or 401)
    errorUri, context) {
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
    toOAuth2Response() {
        const response = {
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
    toApiResponse() {
        const baseResponse = super.toApiResponse();
        if (baseResponse.error && this.errorUri) {
            baseResponse.error.details = Object.assign(Object.assign({}, baseResponse.error.details), { error_uri: this.errorUri });
        }
        return baseResponse;
    }
}
exports.OAuth2Error = OAuth2Error;
