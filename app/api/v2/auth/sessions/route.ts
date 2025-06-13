// 文件路径: app/api/v2/auth/sessions/route.ts
// 描述: 获取当前会话信息端点 (Get current session information endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { JWTUtils } from '@/lib/auth/oauth2'; // 假设 JWTUtils 包含验证V2认证令牌的方法
import { User } from '@prisma/client';

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'session_info_failed', message }, { status });
}

export async function GET(req: NextRequest) {
  // 1. 用户认证 (User Authentication via V2 Auth session token)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const token = authHeader.substring(7); // 提取令牌 (Extract token)
  if (!token) {
    return errorResponse('Unauthorized: Missing session token.', 401, 'unauthorized');
  }

  // 2. 验证访问令牌并提取声明 (Verify access token and extract claims)
  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) {
    return errorResponse(`Unauthorized: Invalid or expired session token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  }

  const userId = payload.userId as string | undefined;
  const sessionId = payload.jti as string | undefined; // JWT ID, can serve as session identifier
  const issuedAt = payload.iat ? new Date((payload.iat as number) * 1000) : undefined; // Issued at
  const expiresAt = payload.exp ? new Date((payload.exp as number) * 1000) : undefined; // Expiration time

  if (!userId) {
    return errorResponse('Unauthorized: Invalid session token payload (User ID missing).', 401, 'invalid_token_payload');
  }
  if (!sessionId || !issuedAt || !expiresAt) {
    // jti, iat, exp 都是标准JWT声明，对于会话令牌应该是存在的
    // (jti, iat, exp are standard JWT claims and should be present for session tokens)
    return errorResponse('Unauthorized: Invalid session token payload (missing jti, iat, or exp).', 401, 'invalid_token_payload_details');
  }

  try {
    // 3. 获取用户信息 (Fetch user information)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse('Unauthorized: User associated with the token not found.', 401, 'user_not_found');
    }
    if (!user.isActive) {
      return errorResponse('Forbidden: User account is inactive.', 403, 'account_inactive');
    }

    // 4. 构建会话信息对象 (Construct session information object)
    // 注意：此端点仅描述当前令牌代表的会话。
    // (Note: This endpoint only describes the session represented by the current token.)
    // 完整的会话列表需要服务器端存储会话信息。
    // (A full list of sessions would require server-side storage of session information.)
    const currentSession = {
      sessionId: sessionId,
      userId: user.id,
      username: user.username, // 从数据库获取的用户名 (Username from database)
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ipAddress: req.headers.get('x-forwarded-for') || req.ip || 'N/A', // 当前请求的IP (IP of current request)
      userAgent: req.headers.get('user-agent') || 'N/A', // 当前请求的User-Agent (User-Agent of current request)
      isCurrentSession: true, // 明确指出这是当前会话 (Clearly indicates this is the current session)
      // 可以添加其他从令牌或用户信息中获取的相关信息 (Other relevant info from token or user can be added)
      // e.g., roles: payload.roles,
    };

    // 5. 返回响应 (Return response)
    // 以数组形式返回，符合预期可能有多个会话的场景 (Return as an array, fitting scenarios where multiple sessions might be expected)
    return NextResponse.json({ sessions: [currentSession] }, { status: 200 });

  } catch (error: any) {
    console.error(`Error fetching session info for user ${userId}:`, error);
    return errorResponse('An unexpected error occurred while retrieving session information.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
// 其 payload 应包含 userId, jti, iat, exp
// (Its payload should include userId, jti, iat, exp)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: {
        userId: string;
        username?: string; // username might also be in token
        jti?: string;
        iat?: number;
        exp?: number;
        aud?: string;
        roles?: string[];
        [key: string]: any
      };
      error?: string;
    }>;
    // ... other methods
  }
}
*/
