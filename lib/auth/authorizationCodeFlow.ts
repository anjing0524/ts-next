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
 */
import { prisma } from '@/lib/prisma';
import { addSeconds } from 'date-fns';
import crypto from 'crypto';

export interface AuthorizationCodeData {
  code: string;
  clientId: string; // This should be the actual ID (cuid) of the OAuthClient record
  userId: string;
  redirectUri: string;
  scope: string; // JSON string for scopes
  codeChallenge: string;
  codeChallengeMethod: 'S256'; // PKCE code challenge method, S256 is mandated
  expiresAt: Date;
}

export const DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS = 600; // 10 minutes

/**
 * 存储授权码到数据库。
 * Stores the authorization code in the database.
 *
 * @param clientId - OAuth客户端的数据库ID (The database ID of the OAuthClient).
 * @param userId - 用户的ID.
 * @param redirectUri - 授权请求中提供的重定向URI.
 * @param scope - 请求的权限范围 (JSON string).
 * @param codeChallenge - PKCE代码质询.
 * @param codeChallengeMethod - PKCE代码质C询方法 (必须为 "S256").
 * @param expiresInSeconds - (可选) 授权码的有效期（秒）, 默认10分钟.
 * @returns 返回创建的授权码记录 (包含生成的code).
 * @throws Error - 如果数据库操作失败.
 */
export async function storeAuthorizationCode(
  clientId: string,
  userId: string,
  redirectUri: string,
  scope: string,
  codeChallenge: string,
  codeChallengeMethod: 'S256',
  expiresInSeconds: number = DEFAULT_AUTHORIZATION_CODE_LIFETIME_SECONDS,
): Promise<AuthorizationCodeData & { id: string; createdAt: Date; isUsed: boolean }> {
  if (codeChallengeMethod !== 'S256') {
    throw new Error('Invalid code_challenge_method. Only S256 is supported.');
  }

  const generatedCode = crypto.randomBytes(32).toString('hex'); // 生成一个安全的随机授权码
  const expiresAt = addSeconds(new Date(), expiresInSeconds);

  try {
    const storedCode = await prisma.authorizationCode.create({
      data: {
        code: generatedCode,
        clientId, // This is OAuthClient.id (cuid)
        userId,
        redirectUri,
        scope,
        codeChallenge,
        codeChallengeMethod,
        expiresAt,
        isUsed: false,
      },
    });
    return storedCode;
  } catch (error) {
    console.error('Failed to store authorization code:', error);
    throw new Error('Database error while storing authorization code.');
  }
}

/**
 * 验证授权码的有效性.
 * Validates an authorization code, including PKCE verification.
 *
 * @param code - 用户提供的授权码.
 * @param expectedClientId - 期望的OAuth客户端的数据库ID (The database ID of the expected OAuthClient).
 * @param expectedRedirectUri - 期望的重定向URI.
 * @param codeVerifier - PKCE代码验证器.
 * @returns 返回存储的授权码信息如果有效且未被使用, 否则返回null.
 *          成功验证后，授权码会被标记为已使用或删除.
 * @throws Error - 如果发生数据库错误或验证逻辑错误.
 */
export async function validateAuthorizationCode(
  code: string,
  expectedClientId: string, // This is OAuthClient.id (cuid)
  expectedRedirectUri: string,
  codeVerifier: string,
): Promise<(AuthorizationCodeData & { userId: string; scope: string }) | null> {
  try {
    const storedCode = await prisma.authorizationCode.findUnique({
      where: { code },
    });

    if (!storedCode) {
      console.log(`Authorization code "${code}" not found.`);
      return null;
    }

    if (storedCode.isUsed) {
      console.log(`Authorization code "${code}" has already been used.`);
      // OAuth 2.0 Security Best Current Practice: an authorization server SHOULD revoke all tokens issued based on the authorization code
      // This might involve more complex logic to find and revoke related tokens if a used code is attempted again.
      // For now, simply denying reuse is essential.
      return null;
    }

    if (storedCode.expiresAt < new Date()) {
      console.log(`Authorization code "${code}" has expired at ${storedCode.expiresAt}.`);
      // Optionally, delete expired codes
      await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
      return null;
    }

    if (storedCode.clientId !== expectedClientId) {
      console.log(`Client ID mismatch for code "${code}". Expected ${expectedClientId}, got ${storedCode.clientId}.`);
      return null;
    }

    // 虽然OAuth 2.0标准在令牌端点上不强制要求redirect_uri，但如果授权码请求中包含它，则令牌请求中也必须包含且匹配。
    // OAuth 2.0 spec: if the redirect_uri parameter was included in the authorization request,
    // and their values are identical, otherwise, the authorization server MUST deny the request.
    // For added security, many implementations require it if it was present in the auth request.
    // Here, we assume if it was stored, it must match.
    if (storedCode.redirectUri !== expectedRedirectUri) {
       console.log(`Redirect URI mismatch for code "${code}". Expected ${expectedRedirectUri}, got ${storedCode.redirectUri}.`);
       return null;
    }

    // PKCE Verification (S256)
    if (storedCode.codeChallengeMethod === 'S256') {
      const hashedVerifier = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url'); // base64url encoding
      if (hashedVerifier !== storedCode.codeChallenge) {
        console.log(`PKCE verification failed for code "${code}". Challenge does not match verifier.`);
        return null;
      }
    } else {
      // Should not happen if storeAuthorizationCode enforces S256
      console.error(`Unsupported code_challenge_method "${storedCode.codeChallengeMethod}" found for code "${code}".`);
      return null;
    }

    // 标记授权码为已使用 (Mark the code as used)
    // 替代方案是直接删除: await prisma.authorizationCode.delete({ where: { id: storedCode.id } });
    // 标记为已使用有助于检测重复使用攻击的尝试。
    await prisma.authorizationCode.update({
      where: { id: storedCode.id },
      data: { isUsed: true },
    });

    return {
      code: storedCode.code,
      clientId: storedCode.clientId,
      userId: storedCode.userId,
      redirectUri: storedCode.redirectUri,
      scope: storedCode.scope,
      codeChallenge: storedCode.codeChallenge,
      codeChallengeMethod: storedCode.codeChallengeMethod as 'S256', // Already validated
      expiresAt: storedCode.expiresAt,
    };
  } catch (error) {
    console.error('Error during authorization code validation:', error);
    throw new Error('Database error during authorization code validation.');
  }
}
