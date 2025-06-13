// 文件路径: app/api/v2/auth/refresh/route.ts
// 描述: 使用刷新令牌获取新的访问令牌端点 (Endpoint to get a new access token using a refresh token)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { JWTUtils } from '@/lib/auth/oauth2'; // 假设 JWTUtils 包含验证和创建V2认证令牌的方法

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'refresh_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { refreshToken } = requestBody;

  // 1. 检查刷新令牌是否存在 (Check if refresh token exists)
  if (!refreshToken) {
    return errorResponse('Refresh token is required.', 400, 'invalid_request');
  }

  try {
    // 2. 验证刷新令牌 (Verify refresh token)
    // 假设 JWTUtils.verifyV2AuthRefreshToken 用于验证此特定类型的刷新令牌
    // (Assuming JWTUtils.verifyV2AuthRefreshToken is used for this specific type of refresh token)
    // 它应检查签名、有效期，并确保是为会话刷新设计的令牌 (It should check signature, expiry, and ensure it's a token designed for session refresh)
    const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthRefreshToken(refreshToken as string);

    if (!valid || !payload) {
      console.warn(`Refresh token verification failed. Error: ${tokenError || 'No payload'}`);
      return errorResponse(`Invalid or expired refresh token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
    }

    // 3. 从令牌中获取 userId (Get userId from token)
    const userId = payload.userId as string | undefined;
    if (!userId) {
      console.warn('User ID (userId) not found in refresh token payload.');
      return errorResponse('Invalid refresh token: User ID missing.', 401, 'invalid_token_payload');
    }

    // 4. 验证用户 (Validate user)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.warn(`User with ID ${userId} from refresh token not found in database.`);
      return errorResponse('User associated with this refresh token not found.', 401, 'user_not_found');
    }

    if (!user.isActive) {
      console.warn(`User ${userId} is inactive. Refresh token invalidation.`);
      return errorResponse('User account is inactive. Cannot refresh token.', 401, 'account_inactive');
    }

    // 可选：检查刷新令牌是否已被撤销（如果实现了JTI或基于数据库的撤销列表）
    // (Optional: Check if refresh token has been revoked if JTI or DB-based denylist is implemented)
    const jti = payload.jti as string | undefined;
    if (!jti) {
      // 如果刷新令牌没有JTI，则无法检查其是否已被特定撤销。这通常表示令牌设计问题。
      // (If refresh token has no JTI, it cannot be checked for specific revocation. This usually indicates a token design issue.)
      console.warn(`Refresh token for user ${userId} is missing JTI. Cannot check denylist.`);
      // 根据策略，可以选择拒绝此类令牌，或者允许它们（如果JTI撤销是可选的增强功能）
      // (Depending on policy, can choose to reject such tokens, or allow if JTI revocation is an optional enhancement)
      // 为了安全起见，如果期望有JTI进行撤销检查，则应拒绝 (For security, if JTI is expected for revocation checks, it should be rejected)
      return errorResponse('Invalid refresh token: JTI missing.', 401, 'invalid_token_payload_jti');
    }

    // 检查JTI是否在撤销列表中 (Check if JTI is in the denylist)
    const revokedJtiEntry = await prisma.revokedAuthJti.findUnique({
      where: { jti: jti },
    });

    if (revokedJtiEntry) {
      // JTI存在于拒绝列表中，意味着此刷新令牌已被撤销
      // (JTI exists in the denylist, meaning this refresh token has been revoked)
      console.warn(`Attempt to use revoked refresh token (JTI: ${jti}) for user ${userId}.`);
      return errorResponse('Refresh token has been revoked.', 401, 'token_revoked');
    }

    // 5. 生成新的访问令牌 (Generate new access token)
    const newAccessTokenPayload = {
      userId: user.id,
      username: user.username,
      // aud: 'urn:api:v2:session', // 与登录时颁发的访问令牌保持一致 (Consistent with access tokens issued at login)
      // roles: user.roles.map(role => role.name) // 同样，如果需要角色信息 (Similarly, if role info is needed)
    };
    const newAccessToken = await JWTUtils.createV2AuthAccessToken(newAccessTokenPayload);
    const newAccessTokenExpiresIn = 3600; // 1小时 (1 hour)

    // 6. 构建响应 (Construct response)
    return NextResponse.json({
      accessToken: newAccessToken,
      tokenType: 'Bearer',
      expiresIn: newAccessTokenExpiresIn,
    });

  } catch (error: any) {
    // 捕获 JWTUtils.verifyV2AuthRefreshToken 可能抛出的其他异常
    // (Catch other exceptions that JWTUtils.verifyV2AuthRefreshToken might throw)
    console.error('/refresh endpoint error:', error);
    // 避免在生产中泄露敏感错误信息 (Avoid leaking sensitive error info in production)
    return errorResponse('An unexpected error occurred while refreshing token.', 500, 'server_error');
  }
}

// 确保 JWTUtils 中的方法在 lib/auth/oauth2.ts 中声明或实现
// (Ensure methods in JWTUtils are declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async createV2AuthAccessToken(payload: { userId: string; username: string; aud?: string; roles?: string[] }): Promise<string>;
    static async verifyV2AuthRefreshToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; jti?: string, [key: string]: any }; // 刷新令牌的载荷可能更简单 (Payload for refresh token might be simpler)
      error?: string;
    }>;
    // ... other methods
  }
}
*/
