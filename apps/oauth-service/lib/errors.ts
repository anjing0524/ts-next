/**
 * 错误类
 * 复用 @repo/lib 包的错误定义
 */
export {
  BaseError,
  OAuth2Error,
  OAuth2ErrorCode,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ResourceNotFoundError,
  TokenError,
  TokenGenerationError,
  TokenValidationError,
  TokenExpiredError,
  TokenRevocationError,
  CryptoError,
  ConfigurationError
} from '@repo/lib/errors'; 