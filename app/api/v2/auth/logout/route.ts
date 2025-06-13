// 文件路径: app/api/v2/auth/logout/route.ts
// 描述: 用户登出端点 (User logout endpoint)

import { NextRequest, NextResponse } from 'next/server';
// import { verifyV2SessionAccessToken, verifyV2SessionRefreshToken, V2AccessTokenPayload, V2RefreshTokenPayload } from '@/lib/auth/v2AuthUtils'; // REMOVED
// import prisma from '@/lib/prisma'; // REMOVED

// 辅助函数：构建响应 (Helper function: Build response)
function buildResponse(message: string, status: number, data?: Record<string, any>) { // Renamed from errorResponse to buildResponse as it's more general
  const responseBody = { message, ...data };
  return NextResponse.json(responseBody, { status });
}

export async function POST(req: NextRequest) {
  // This endpoint was for V2 session tokens which are now removed.
  // Standard OAuth 2.0 token revocation is handled by /api/v2/oauth/revoke.
  // Client-side logout involves discarding tokens.
  // If this endpoint were to serve a purpose for OAuth, it would be for the
  // Resource Owner to signal they want to "log out" of a specific client,
  // which might involve revoking the client's refresh token for that user,
  // or all tokens related to that user for that client. This is complex and
  // usually handled by the /revoke endpoint with client authentication.

  console.warn('Deprecated /api/v2/auth/logout endpoint was called.');
  return buildResponse(
    'This logout endpoint is deprecated. OAuth clients should discard tokens locally. For server-side revocation, use /api/v2/oauth/revoke with client authentication.',
    404, // Not Found or 410 Gone
    { errorCode: 'endpoint_deprecated' }
  );
}

// No longer need to declare JWTUtils methods from a removed system.
