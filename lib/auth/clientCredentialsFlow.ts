// lib/auth/clientCredentialsFlow.ts

/**
 * OAuth 2.1 Client Credentials Flow Logic.
 * Handles client authentication and token issuance for the client credentials grant.
 *
 * 主要功能:
 * - 认证OAuth客户端 (机密客户端和公开客户端)
 * - 为认证通过的客户端颁发访问令牌
 *
 * 依赖:
 * - Prisma (数据库交互)
 * - bcrypt (用于机密客户端密钥哈希比对)
 * - JWTUtils from ./oauth2 (用于JWT生成)
 */
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { JWTUtils } from './oauth2'; // 导入 JWTUtils 用于令牌生成 (Import JWTUtils for token generation)
import { OAuthClient, ClientType as PrismaClientType } from '@prisma/client'; // Import Prisma generated type
import { AuthenticationError, ConfigurationError, BaseError } from '../errors'; // 导入自定义错误类 (Import custom error classes)

// AuthenticatedClient 接口定义了客户端认证成功后需要暴露的基本信息。
// The AuthenticatedClient interface defines the basic information to be exposed after successful client authentication.
export interface AuthenticatedClient {
  id: string; // 客户端在数据库中的唯一ID (一般为CUID或UUID) (Client's unique ID in the database (usually CUID or UUID))
  clientId: string; // 客户端的公开标识符 (Client's public identifier)
  clientType: PrismaClientType; // 客户端类型 (例如 'CONFIDENTIAL' 或 'PUBLIC') (Client type (e.g., 'CONFIDENTIAL' or 'PUBLIC'))
  allowedScopes: string | null; // 客户端被允许请求的权限范围 (JSON字符串格式) (Scopes the client is allowed to request (JSON string format))
  name: string; // 客户端名称 (Client name)
  accessTokenTtl?: number | null; // 客户端特定的访问令牌生命周期（秒）(Client-specific access token TTL in seconds)
}


/**
 * 认证 OAuth 客户端。此函数特定于客户端凭证流程的内部认证需求。
 * Authenticates an OAuth client. This function is specific to internal authentication needs of the client credentials flow.
 *
 * @param clientId - 客户端的 `clientId` 字符串. (The client's `clientId` string.)
 * @param clientSecret - (可选) 客户端的密钥. 如果提供，则认为是机密客户端认证尝试. ((Optional) The client's secret. If provided, considered a confidential client authentication attempt.)
 * @returns 返回认证成功的客户端信息 (AuthenticatedClient)。 (Returns authenticated client information (AuthenticatedClient).)
 * @throws {AuthenticationError} 如果客户端未找到、非活动、凭证无效。 (If client not found, inactive, credentials invalid.)
 * @throws {ConfigurationError} 如果客户端配置错误（例如，机密客户端缺少密钥）。 (If client configuration is erroneous (e.g., confidential client missing secret).)
 * @throws {BaseError} 如果数据库操作失败或其他内部错误。 (If a database operation fails or other internal error.)
 */
export async function authenticateClient(
  clientId: string,
  clientSecret?: string,
): Promise<AuthenticatedClient> {
  let clientRecord: OAuthClient | null;
  try {
    clientRecord = await prisma.oAuthClient.findUnique({
      where: { clientId },
    });
  } catch (error: any) {
    console.error('Database error during client lookup:', error);
    throw new BaseError('Database error during client authentication.', 500, 'DB_CLIENT_LOOKUP_FAILED', { originalError: error.message });
  }

  // 客户端未找到
  // Client not found
  if (!clientRecord) {
    throw new AuthenticationError(`Client ID "${clientId}" not found.`, undefined, 'CLIENT_NOT_FOUND');
  }

  // 客户端非活动状态
  // Client is inactive
  if (!clientRecord.isActive) {
    throw new AuthenticationError(`Client ID "${clientId}" is inactive.`, undefined, 'CLIENT_INACTIVE');
  }

  // 处理机密客户端
  // Handle confidential clients
  if (clientRecord.clientType === PrismaClientType.CONFIDENTIAL) {
    if (!clientSecret) {
      // 机密客户端需要提供密钥
      // Confidential client requires a secret
      throw new AuthenticationError(`Client secret is required for confidential client "${clientId}".`, undefined, 'CLIENT_SECRET_REQUIRED');
    }
    if (!clientRecord.clientSecret) {
      // 配置错误：机密客户端在数据库中没有存储密钥
      // Configuration error: Confidential client has no stored secret in the database
      console.error(`Configuration error: Confidential client "${clientId}" has no stored secret.`);
      throw new ConfigurationError(`Client "${clientId}" is misconfigured: secret not stored.`, 'CLIENT_CONFIG_NO_SECRET');
    }
    // 验证提供的密钥是否与存储的哈希匹配
    // Verify if the provided secret matches the stored hash
    let isSecretValid = false;
    try {
        isSecretValid = await bcrypt.compare(clientSecret, clientRecord.clientSecret);
    } catch (bcryptError: any) {
        console.error(`Error during bcrypt comparison for client ${clientId}:`, bcryptError);
        throw new BaseError('Error during secret verification.', 500, 'BCRYPT_ERROR', { originalError: bcryptError.message });
    }

    if (!isSecretValid) {
      throw new AuthenticationError(`Invalid client secret for client ID "${clientId}".`, undefined, 'INVALID_CLIENT_SECRET');
    }
  } else if (clientRecord.clientType === PrismaClientType.PUBLIC) {
    // 公共客户端仅通过 clientId 认证，不检查密钥
    // Public clients are authenticated by their clientId only, no secret is expected or checked.
    // 如果为公共客户端提供了密钥，通常会忽略它
    // If a secret is provided for a public client, it's typically ignored.
  } else {
    // 不支持的客户端类型
    // Unsupported client type
    const unsupportedTypeMessage = `Unsupported client type "${clientRecord.clientType}" for client ID "${clientId}".`;
    console.error(unsupportedTypeMessage);
    // 这更像是一个配置或数据完整性问题
    // This is more of a configuration or data integrity issue
    throw new ConfigurationError(unsupportedTypeMessage, 'UNSUPPORTED_CLIENT_TYPE');
  }

  // 认证成功，返回客户端信息
  // Authentication successful, return client information
  return {
    id: clientRecord.id,
    clientId: clientRecord.clientId,
    name: clientRecord.name,
    clientType: clientRecord.clientType,
    allowedScopes: clientRecord.allowedScopes,
    accessTokenTtl: clientRecord.accessTokenTtl,
  };
}

// 客户端凭证授权流程默认的访问令牌TTL（秒）
// Default Access Token TTL (in seconds) for Client Credentials Flow
export const DEFAULT_CLIENT_CREDENTIALS_TOKEN_TTL_SECONDS = 3600; // 例如1小时 (e.g., 1 hour)


/**
 * 为客户端凭证授权流程颁发访问令牌.
 * Grants an access token for the client credentials flow.
 *
 * @param client - 经过认证的客户端对象 (AuthenticatedClient). (The authenticated client object.)
 * @param requestedScope - (可选) 客户端请求的权限范围 (字符串，空格分隔). ((Optional) Scopes requested by the client (string, space-separated).)
 *                         如果未提供，则使用客户端默认配置的权限范围或一个受限的默认范围. (If not provided, uses the client's default configured scopes or a restricted default.)
 * @returns 返回生成的JWT访问令牌字符串. (Returns the generated JWT access token string.)
 * @throws {Error} 如果请求的scope无效. (If the requested scope is invalid.)
 * @throws {TokenGenerationError} 如果令牌生成失败. (If token generation fails.)
 */
export async function grantClientCredentialsToken(
  client: AuthenticatedClient,
  requestedScope?: string,
): Promise<string> {
  let finalScopes: string[]; // 最终授予的权限范围数组 (Array of finally granted scopes)
  // 解析客户端配置中允许的权限范围 (通常是JSON字符串)
  // Parse allowed scopes from client configuration (usually a JSON string)
  const clientAllowedScopes: string[] = client.allowedScopes ? JSON.parse(client.allowedScopes) : [];

  if (requestedScope) {
    const requestedScopeArray = requestedScope.split(' ').filter(s => s);
    const allRequestedScopesAllowed = requestedScopeArray.every(rs => clientAllowedScopes.includes(rs));
    if (!allRequestedScopesAllowed) {
      const disallowed = requestedScopeArray.filter(rs => !clientAllowedScopes.includes(rs));
      // 使用 ValidationError 或 OAuth2Error(InvalidScope) 更合适
      // Using ValidationError or OAuth2Error(InvalidScope) would be more appropriate
      throw new Error(`Requested scope '${disallowed.join(', ')}' is not allowed for this client.`);
    }
    finalScopes = requestedScopeArray;
  } else {
    finalScopes = clientAllowedScopes;
  }

  if (finalScopes.length === 0) {
    console.warn(`Client "${client.clientId}" is being granted a token with no scopes.`);
  }

  const expiresInSeconds = client.accessTokenTtl ?? DEFAULT_CLIENT_CREDENTIALS_TOKEN_TTL_SECONDS;
  const expiresInString = `${expiresInSeconds}s`;


  try {
    const token = await JWTUtils.createAccessToken({
      client_id: client.clientId,
      scope: finalScopes.join(' '),
      permissions: [],
      exp: expiresInString,
    });
    return token;
  } catch (error: any) {
    console.error(`Failed to generate token for client "${client.clientId}":`, error);
    // 如果 JWTUtils.createAccessToken 抛出 ConfigurationError，它将被上层捕获
    // If JWTUtils.createAccessToken throws ConfigurationError, it will be caught by upper layer
    // 此处应抛出 TokenGenerationError
    // Should throw TokenGenerationError here
    throw new TokenGenerationError('Token generation failed for client credentials grant.', { originalError: error.message });
  }
}
