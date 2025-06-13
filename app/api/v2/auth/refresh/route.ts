// 文件路径: app/api/v2/auth/refresh/route.ts
// 描述: 使用刷新令牌获取新的访问令牌端点 (Endpoint to get a new access token using a refresh token)

import { NextRequest, NextResponse } from 'next/server';
// import prisma from '@/lib/prisma'; // No longer needed as this endpoint is deprecated
// import { verifyV2SessionRefreshToken, createV2SessionAccessToken, V2RefreshTokenPayload } from '@/lib/auth/v2AuthUtils'; // REMOVED

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'refresh_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  // This endpoint was for V2 session tokens which are now removed.
  // OAuth 2.0 refresh tokens are handled by /api/v2/oauth/token.
  console.warn('Deprecated /api/v2/auth/refresh endpoint was called.');
  return errorResponse(
    'This refresh token endpoint is deprecated. Use the OAuth /token endpoint for refreshing tokens.',
    404, // Not Found or 410 Gone might be appropriate
    'endpoint_deprecated'
  );
}

// 确保 JWTUtils 中的方法在 lib/auth/oauth2.ts 中声明或实现 - NO LONGER NEEDED
// (Ensure methods in JWTUtils are declared or implemented in lib/auth/oauth2.ts)
