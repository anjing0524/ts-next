// lib/auth/authorizationCodeFlow.ts

/**
 * OAuth 2.1 Authorization Code Flow Logic.
 * Handles storage and validation of authorization codes with PKCE.
 *
 * 主要功能:
 * - 存储授权码 (包含PKCE质询)
 * - 验证授权码 (包含PKCE校验)
 *
 * 依赖:
 * - Prisma (数据库交互)
 * - crypto (PKCE校验哈希)
 * - date-fns (日期操作)
 * - 自定义错误类 (Custom error classes)
 */
import { prisma } from 'lib/prisma';
import { addSeconds } from 'date-fns';
import crypto from 'crypto';
import {
  BaseError,
  ResourceNotFoundError,
  ValidationError,
  AuthenticationError,
  CryptoError,
  TokenValidationError,
  TokenExpiredError
} from '@repo/lib/errors'; // 导入自定义错误类 (Import custom error classes)
import { AuthorizationCode as PrismaAuthorizationCode } from '@prisma/client'; // Prisma 类型 (Prisma type)

// 授权码数据接口，定义了授权码对象的基本结构
// AuthorizationCodeData interface, defines the basic structure of an authorization code object
export interface AuthorizationCodeData {
  code: string; // 授权码本身 (The authorization code itself)
  clientId: string; // OAuth客户端的数据库ID (The database ID of the OAuthClient record)
  userId: string; // 用户的ID (The user's ID)
  redirectUri: string; // 授权请求中提供的重定向URI (Redirect URI provided in the authorization request)
  scope: string; // 请求的权限范围 (JSON字符串格式) (Requested scopes (JSON string format))
  codeChallenge: string; // PKCE代码质询 (PKCE code challenge)
  codeChallengeMethod: 'S256'; // PKCE代码质询方法，强制为S256 (PKCE code challenge method, S256 is mandated)
  expiresAt: Date; // 授权码的过期时间 (Expiration time of the authorization code)
}

// 默认授权码生命周期（秒），例如10分钟
// Default authorization code lifetime in seconds, e.g., 10 minutes
export const DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS = 600;

// 内部函数，用于生成安全的随机字符串，可用作授权码
// Internal function to generate a secure random string, can be used for authorization codes
// 此函数在当前版本的 storeAuthorizationCode 中未直接导出或使用，因为 crypto.randomBytes(32).toString('hex') 被直接使用
// This function is not directly exported or used in the current version of storeAuthorizationCode, as crypto.randomBytes(32).toString('hex') is used directly.
export function generateSecureRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}


/**
 * 存储授权码到数据库。
 * Stores the authorization code in the database.
 *
 * @param userId - 用户的ID。 (The user's ID.)
 * @param clientId - OAuth客户端的数据库ID (The database ID of the OAuthClient).
 * @param redirectUri - 授权请求中提供的重定向URI. (Redirect URI provided in the authorization request.)
 * @param codeChallenge - PKCE代码质询. (PKCE code challenge.)
 * @param codeChallengeMethod - PKCE代码质询方法 (必须为 "S256"). (PKCE code challenge method (must be "S256").)
 * @param scope - 请求的权限范围 (格式化后的字符串). (Requested scopes (formatted string).)
 * @param expiresInSeconds - (可选) 授权码的有效期（秒）, 默认10分钟. ((Optional) Lifetime of the authorization code in seconds, defaults to 10 minutes.)
 * @param nonce - (可选) OIDC nonce 值。 ((Optional) OIDC nonce value.)
 * @returns 返回创建的授权码记录 (包含生成的code). (Returns the created authorization code record (including the generated code).)
 * @throws {ConfigurationError} 如果 codeChallengeMethod 不是 "S256". (If codeChallengeMethod is not "S256".)
 * @throws {BaseError} 如果数据库操作失败. (If a database operation fails.)
 */
export async function storeAuthorizationCode(
  userId: string,
  clientId: string, // This is OAuthClient.id (cuid)
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: string, // 允许 string 类型以便进行验证 (Allow string type for validation)
  scope: string,
  expiresInSeconds: number = DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS,
  nonce?: string,
): Promise<PrismaAuthorizationCode> {
  // 验证 codeChallengeMethod 是否为 "S256"
  // Validate if codeChallengeMethod is "S256"
  if (codeChallengeMethod !== 'S256') {
          throw new ValidationError(`Unsupported code challenge method: ${codeChallengeMethod}. Only 'S256' is supported.`, { codeChallengeMethod }, 'UNSUPPORTED_CHALLENGE_METHOD');
  }

  // 生成一个安全的随机授权码
  // Generate a secure random authorization code
  const generatedCode = generateSecureRandomString(32);
  // 计算授权码的过期时间
  // Calculate the expiration time for the authorization code
  const expiresAt = addSeconds(new Date(), expiresInSeconds);

  try {
    // 在数据库中创建授权码记录
    // Create the authorization code record in the database
    const storedCode = await prisma.authorizationCode.create({
      data: {
        code: generatedCode,
        userId,
        clientId, // 这是 OAuthClient.id (cuid) (This is OAuthClient.id (cuid))
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod, // 此处已验证为 'S256' (Validated as 'S256' here)
        expiresAt,
        isUsed: false, // 新生成的授权码标记为未使用 (Newly generated authorization code is marked as unused)
        nonce: nonce || null, // 存储 nonce (如果提供) (Store nonce if provided)
      },
    });
    return storedCode;
  } catch (error) {
    // 数据库操作失败，记录错误并抛出 BaseError
    // Database operation failed, log error and throw BaseError
    console.error('Failed to store authorization code:', error);
          throw new CryptoError('Database error while storing authorization code.', { originalError: error.message });
  }
}

/**
 * 验证授权码的有效性，包括PKCE校验。
 * Validates an authorization code, including PKCE verification.
 * 成功验证后，授权码会被标记为已使用。如果授权码已过期或已使用，则会将其从数据库中删除。
 * Upon successful validation, the authorization code is marked as used. If the code is expired or already used, it is deleted from the database.
 *
 * @param code - 用户提供的授权码字符串。 (The authorization code string provided by the user.)
 * @param expectedClientId - 期望的OAuth客户端的数据库ID (cuid)。 (The database ID (cuid) of the expected OAuthClient.)
 * @param expectedRedirectUri - 期望的重定向URI。 (The expected redirect URI.)
 * @param codeVerifier - PKCE代码验证器。 (The PKCE code verifier.)
 * @returns 返回有效的、未被使用的授权码信息。 (Returns the valid, unused authorization code information.)
 * @throws {ResourceNotFoundError} 如果授权码未找到。 (If the authorization code is not found.)
 * @throws {TokenError} 如果授权码已使用或已过期。 (If the authorization code has been used or has expired.)
 * @throws {ValidationError} 如果客户端ID或重定向URI不匹配。 (If the client ID or redirect URI does not match.)
 * @throws {AuthenticationError} 如果PKCE校验失败。 (If PKCE verification fails.)
 * @throws {ConfigurationError} 如果存储的 codeChallengeMethod 不受支持。 (If the stored codeChallengeMethod is unsupported.)
 * @throws {BaseError} 如果发生其他数据库错误。 (If another database error occurs.)
 */
export async function validateAuthorizationCode(
  code: string,
  expectedClientId: string, // 这是 OAuthClient.id (cuid) (This is OAuthClient.id (cuid))
  expectedRedirectUri: string,
  codeVerifier: string,
): Promise<PrismaAuthorizationCode> { // 返回 Prisma 模型类型 (Return Prisma model type)
  let storedCode: PrismaAuthorizationCode | null = null;
  try {
    // 从数据库中查找授权码
    // Find the authorization code in the database
    storedCode = await prisma.authorizationCode.findUnique({
      where: { code },
    });

    // 如果授权码不存在
    // If authorization code does not exist
    if (!storedCode) {
      throw new ResourceNotFoundError('Invalid authorization code: Code not found.', 'AUTH_CODE_NOT_FOUND');
    }

    // 如果授权码已被使用
    // If authorization code has already been used
    if (storedCode.isUsed) {
      // OAuth 2.0 安全最佳实践建议，如果尝试重用已使用的授权码，则应撤销基于此授权码发行的所有令牌。
      // OAuth 2.0 Security Best Current Practice: an authorization server SHOULD revoke all tokens issued based on the authorization code
      // 这可能涉及更复杂的逻辑来查找和撤销相关令牌。
      // This might involve more complex logic to find and revoke related tokens.
      // 为简化，此处删除已使用的授权码以防止进一步尝试，并抛出错误。
      // For simplicity, delete the used code to prevent further attempts and throw an error.
      await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
              throw new TokenValidationError('Invalid authorization code: Code has already been used.', { code: code }, 'AUTH_CODE_USED');
    }

    // 如果授权码已过期
    // If authorization code has expired
    if (storedCode.expiresAt < new Date()) {
      // 删除已过期的授权码
      // Delete the expired authorization code
      await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
              throw new TokenExpiredError('Invalid authorization code: Code has expired.', { code: code, expiresAt: storedCode.expiresAt });
    }

    // 验证客户端ID是否匹配
    // Validate if client ID matches
    if (storedCode.clientId !== expectedClientId) {
      throw new ValidationError('Invalid authorization code: Client ID mismatch.', { expected: expectedClientId, actual: storedCode.clientId }, 'AUTH_CODE_CLIENT_ID_MISMATCH');
    }

    // 验证重定向URI是否匹配
    // OAuth 2.0规范：如果在授权请求中包含了redirect_uri参数，则令牌请求中也必须包含且值相同。
    // OAuth 2.0 spec: if the redirect_uri parameter was included in the authorization request,
    // and their values are identical, otherwise, the authorization server MUST deny the request.
    // 为增强安全性，许多实现都要求在授权请求中存在此参数时必须匹配。
    // For added security, many implementations require it if it was present in the auth request.
    // 此处假设如果已存储，则必须匹配。
    // Here, we assume if it was stored, it must match.
    if (storedCode.redirectUri !== expectedRedirectUri) {
       throw new ValidationError('Invalid authorization code: Redirect URI mismatch.', { expected: expectedRedirectUri, actual: storedCode.redirectUri }, 'AUTH_CODE_REDIRECT_URI_MISMATCH');
    }

    // PKCE 校验 (S256)
    // PKCE Verification (S256)
    if (storedCode.codeChallengeMethod === 'S256') {
      // 使用提供的 codeVerifier 计算哈希值
      // Calculate hash value using the provided codeVerifier
      const hashedVerifier = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url'); // 使用 base64url 编码 (Use base64url encoding)
      // 比较计算出的哈希值与存储的 codeChallenge
      // Compare the calculated hash value with the stored codeChallenge
      if (hashedVerifier !== storedCode.codeChallenge) {
        throw new AuthenticationError('Invalid authorization code: PKCE verification failed.', undefined, 'PKCE_VERIFICATION_FAILED');
      }
    } else {
      // 如果 storeAuthorizationCode 强制使用 S256，则不应发生此情况
      // Should not happen if storeAuthorizationCode enforces S256
              throw new ValidationError(`Unsupported code challenge method in stored code: ${storedCode.codeChallengeMethod}. Only 'S256' is supported.`, { storedMethod: storedCode.codeChallengeMethod }, 'UNSUPPORTED_STORED_CHALLENGE_METHOD');
    }

    // 验证成功，将授权码标记为已使用
    // Validation successful, mark the authorization code as used
    // 备选方案是直接删除: await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
    // Alternative is to delete directly: await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
    // 标记为已使用有助于检测重复使用攻击的尝试。
    // Marking as used helps detect attempts at reuse attacks.
    const updatedCode = await prisma.authorizationCode.update({
      where: { id: storedCode.id },
      data: { isUsed: true },
    });

    return updatedCode; // 返回更新后的（已标记为使用）授权码对象 (Return the updated (marked as used) authorization code object)

  } catch (error) {
    // 如果错误已经是我们定义的自定义错误类型，直接重新抛出
    // If the error is already an instance of our custom error types, re-throw it directly
    if (error instanceof BaseError) {
      throw error;
    }
    // 对于其他未知错误（可能是 Prisma 错误），记录并抛出通用 BaseError
    // For other unknown errors (potentially Prisma errors), log and throw a generic BaseError
    console.error('Error during authorization code validation:', error);
    // 检查是否是 Prisma 已知请求错误，并提供更具体的错误码（如果可能）
    // Check if it's a Prisma known request error and provide a more specific error code if possible
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BaseError(`Database error during authorization code validation: ${error.message}`, 500, `DB_VALIDATE_AUTH_CODE_PRISMA_${error.code}`);
    }
    throw new BaseError('Database error during authorization code validation.', 500, 'DB_VALIDATE_AUTH_CODE_FAILED');
  }
}
