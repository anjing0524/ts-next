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
 * - jose (用于JWT生成 - 通过导入 jwtUtils)
 */
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generateJwtToken, JwtCustomPayload } from './jwtUtils'; // Assuming jwtUtils is in the same directory or correctly aliased
import { OAuthClient } from '@prisma/client'; // Import Prisma generated type

export interface AuthenticatedClient extends Pick<OAuthClient, 'id' | 'clientId' | 'clientType' | 'allowedScopes' | 'name'> {
  // Potentially add other fields needed post-authentication
}

/**
 * 认证 OAuth 客户端.
 * Authenticates an OAuth client using its ID and secret (for confidential clients).
 *
 * @param clientId - 客户端的 `clientId` 字符串.
 * @param clientSecret - (可选) 客户端的密钥. 如果提供，则认为是机密客户端认证尝试.
 * @returns 返回认证成功的客户端信息 (AuthenticatedClient)，如果认证失败则返回 `null`.
 * @throws Error - 如果数据库操作失败.
 */
export async function authenticateClient(
  clientId: string,
  clientSecret?: string,
): Promise<AuthenticatedClient | null> {
  try {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      console.log(`Client authentication failed: Client ID "${clientId}" not found.`);
      return null;
    }

    if (!client.isActive) {
      console.log(`Client authentication failed: Client ID "${clientId}" is inactive.`);
      return null;
    }

    if (client.clientType === 'CONFIDENTIAL') {
      if (!clientSecret) {
        console.log(`Client authentication failed: Client secret required for confidential client "${clientId}".`);
        return null;
      }
      if (!client.clientSecret) {
        // This case should ideally not happen if a confidential client is correctly configured
        console.error(`Configuration error: Confidential client "${clientId}" has no stored secret.`);
        return null;
      }
      const isSecretValid = await bcrypt.compare(clientSecret, client.clientSecret);
      if (!isSecretValid) {
        console.log(`Client authentication failed: Invalid client secret for client ID "${clientId}".`);
        return null;
      }
    } else if (client.clientType === 'PUBLIC') {
      // Public clients are authenticated by their clientId only, no secret is expected or checked.
      // If a secret is provided for a public client, it's typically ignored.
    } else {
      console.error(`Unsupported client type "${client.clientType}" for client ID "${clientId}".`);
      return null; // Should not happen with proper enum usage
    }

    // 认证成功
    return {
      id: client.id, // Prisma's CUID
      clientId: client.clientId,
      name: client.name, // Prisma schema now uses 'name'
      clientType: client.clientType,
      allowedScopes: client.allowedScopes, // JSON string of scopes
    };
  } catch (error) {
    console.error('Error during client authentication:', error);
    throw new Error('Database error during client authentication.');
  }
}

/**
 * 为客户端凭证授权流程颁发访问令牌.
 * Grants an access token for the client credentials flow.
 *
 * @param client - 经过认证的客户端对象 (AuthenticatedClient).
 * @param requestedScope - (可选) 客户端请求的权限范围 (字符串，空格分隔).
 *                         如果未提供，则使用客户端默认配置的权限范围或一个受限的默认范围.
 * @returns 返回生成的JWT访问令牌字符串.
 * @throws Error - 如果令牌生成失败或请求的scope无效.
 */
export async function grantClientCredentialsToken(
  client: AuthenticatedClient,
  requestedScope?: string,
): Promise<string> {
  let finalScopes: string[];
  const clientAllowedScopes: string[] = JSON.parse(client.allowedScopes || '[]');

  if (requestedScope) {
    const requestedScopeArray = requestedScope.split(' ').filter(s => s);
    // 验证请求的scope是否都在客户端允许的范围内
    const allRequestedScopesAllowed = requestedScopeArray.every(rs => clientAllowedScopes.includes(rs));
    if (!allRequestedScopesAllowed) {
      throw new Error('Invalid scope: Requested scope exceeds client\'s allowed scopes.');
    }
    finalScopes = requestedScopeArray;
  } else {
    // 如果客户端未请求特定scope，可以考虑使用客户端的全部允许scope或一个更受限的默认值
    // For client credentials, it's common to grant all allowed scopes if none are specifically requested.
    finalScopes = clientAllowedScopes;
  }

  if (finalScopes.length === 0) {
    // 根据OAuth2.0规范，如果最终的scope为空，不应颁发令牌，或颁发一个不含scope的令牌（取决于策略）
    // 或者，如果客户端必须有某些scope，这里可以抛出错误
    console.warn(`Client "${client.clientId}" is being granted a token with no scopes.`);
    // Depending on policy, could throw: throw new Error('No scopes available for token grant.');
  }

  // 构建JWT载荷
  const jwtPayload: JwtCustomPayload = {
    // 'sub' (subject) for client credentials is the client_id
    // 'iss', 'aud', 'iat', 'exp', 'jti' will be set by generateJwtToken
    scope: finalScopes.join(' '), // 'scope' claim in the token
    // You might add other client-specific claims if needed
  };

  // 令牌有效期 - 可以考虑为客户端凭证设置不同的默认有效期
  const expiresIn = client.accessTokenTtl || 3600; // Use client's configured TTL or default (e.g., 1 hour)

  try {
    // The subject of a token issued for client credentials grant is the client_id itself.
    const token = await generateJwtToken(jwtPayload, client.clientId, expiresIn);
    return token;
  } catch (error) {
    console.error(`Failed to generate token for client "${client.clientId}":`, error);
    throw new Error('Token generation failed for client credentials grant.');
  }
}
