// 文件路径: app/api/v2/auth/sessions/[id]/route.ts
// 描述: 撤销V2认证刷新令牌端点 (Revoke V2 Auth Refresh Token endpoint by its JTI)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification
import { addDays } from 'date-fns'; // For setting expiry for the JTI blacklist entry

const REVOKED_JTI_EXPIRY_DAYS = 30; // JTI在拒绝列表中的有效期 (Expiry for JTI in denylist)

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'session_revocation_failed', message }, { status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } } // {id} is the JTI from the path
) {
  // 1. 用户认证 (User Authentication via V2 Auth session token)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const sessionToken = authHeader.substring(7);
  if (!sessionToken) {
    return errorResponse('Unauthorized: Missing session token.', 401, 'unauthorized');
  }

  const { valid: sessionValid, payload: sessionPayload, error: sessionTokenError } = await JWTUtils.verifyV2AuthAccessToken(sessionToken);
  if (!sessionValid || !sessionPayload) {
    return errorResponse(`Unauthorized: Invalid or expired session token. ${sessionTokenError || ''}`.trim(), 401, 'invalid_token');
  }
  const currentUserId = sessionPayload.userId as string | undefined;
  if (!currentUserId) {
    return errorResponse('Unauthorized: Invalid session token payload (User ID missing).', 401, 'invalid_token_payload');
  }

  // 2. 获取路径参数中的JTI (Get JTI from path parameter)
  const jtiToRevoke = params.id;
  if (!jtiToRevoke || typeof jtiToRevoke !== 'string' || jtiToRevoke.trim() === '') {
    return errorResponse('JTI (session ID) in path parameter is required.', 400, 'invalid_request');
  }

  try {
    // 3. 检查JTI是否已被撤销 (Check if JTI is already revoked)
    const existingRevocation = await prisma.revokedAuthJti.findUnique({
      where: { jti: jtiToRevoke },
    });

    if (existingRevocation) {
      // 如果JTI已在列表中，可以认为操作成功或幂等处理
      // (If JTI is already in the list, can consider operation successful or idempotent)
      // 检查其过期时间，如果需要可以更新 (Check its expiry, update if necessary - though unlikely for this flow)
      return NextResponse.json({ message: 'Session (identified by JTI) was already revoked or scheduled for revocation.' }, { status: 200 });
    }

    // 4. 将JTI添加到撤销列表 (Add JTI to the revocation list)
    // 简化：我们假设用户正在撤销自己的一个刷新令牌的JTI。
    // (Simplification: We assume the user is revoking a JTI of one of their own refresh tokens.)
    // `expiresAt` 设置为从现在起的固定时长，因为我们没有原始刷新令牌的实际过期时间。
    // (`expiresAt` is set to a fixed duration from now, as we don't have the original refresh token's actual expiry.)
    const revocationExpiresAt = addDays(new Date(), REVOKED_JTI_EXPIRY_DAYS);

    await prisma.revokedAuthJti.create({
      data: {
        jti: jtiToRevoke,
        userId: currentUserId, // 将此JTI与执行操作的用户关联 (Associate this JTI with the user performing the action)
        expiresAt: revocationExpiresAt,
      },
    });

    // 5. 返回成功响应 (Return success response)
    // 客户端的相应刷新令牌（如果其JTI匹配）在下次尝试通过 /refresh 端点使用时将失效。
    // (The client's corresponding refresh token (if its JTI matches) will be invalidated on its next use via /refresh endpoint.)
    return NextResponse.json({ message: 'Session (identified by JTI) scheduled for revocation. Associated refresh token will be invalid.' }, { status: 200 });

  } catch (error: any) {
    // 处理 Prisma 的唯一约束冲突错误（尽管上面的检查应该能避免）
    // (Handle Prisma's unique constraint violation error, though the check above should prevent it)
    if (error.code === 'P2002' && error.meta?.target?.includes('jti')) {
        return NextResponse.json({ message: 'Session (identified by JTI) was already revoked or scheduled for revocation (concurrent request).' }, { status: 200 });
    }
    console.error(`Error revoking JTI ${jtiToRevoke} for user ${currentUserId}:`, error);
    return errorResponse('An unexpected error occurred while revoking the session.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any };
      error?: string;
    }>;
    // ... other methods
  }
}
*/
