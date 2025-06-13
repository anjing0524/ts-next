// app/api/oauth/revoke/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ClientAuthUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2'; // Updated import

export async function POST(req: NextRequest) {
  const formData = await req.formData(); // 解析formData一次 (Parse formData once)

  // 1. 客户端认证 (Client Authentication) using ClientAuthUtils
  const authResult = await ClientAuthUtils.authenticateClient(req, formData);

  if (authResult.error || !authResult.client) {
    // RFC 7009 defers to RFC 6749 for client authentication errors.
    // Typically, this means a 400 or 401 with error like 'invalid_client'.
    const status = authResult.error?.error === OAuth2ErrorTypes.INVALID_CLIENT ||
                   authResult.error?.error_description?.toLowerCase().includes('credentials') ||
                   authResult.error?.error_description?.toLowerCase().includes('secret')
                   ? 401 : 400;
    return NextResponse.json(
      { error: authResult.error?.error || OAuth2ErrorTypes.INVALID_CLIENT, error_description: authResult.error?.error_description || 'Client authentication failed.' },
      { status: status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const client = authResult.client; // 已认证的客户端 (Authenticated client)

  try {
    // formData已经从上面读取，可以直接使用 (formData already read, can be used directly)
    const token = formData.get('token') as string;
    const tokenTypeHint = formData.get('token_type_hint') as string | undefined;

    if (!token) {
      // RFC 7009: "the server responds with HTTP status code 200 if the
      // token has been revoked successfully or if the client submitted an
      // invalid token (e.g., invalid syntax), or if the token submitted was issued to
      // another client" - implies missing token also falls under this.
      return new NextResponse(null, { status: 200 });
    }

    // 2. 令牌撤销逻辑 (Token Revocation Logic)
    let tokenProcessed = false; // 标记是否处理了令牌 (Flag to mark if a token was processed) - This flag might be redundant due to RFC 7009 always returning 200.

    // 根据 token_type_hint 或默认检查 AccessToken (Check AccessToken based on token_type_hint or by default)
    if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
      const accessToken = await prisma.accessToken.findUnique({
        where: { token: token }, // Search by actual token value
      });
      if (accessToken) {
        tokenProcessed = true;
        if (accessToken.clientId === client.id) { // 确保令牌属于认证的客户端 (Ensure token belongs to authenticated client)
          if (!accessToken.isRevoked) {
            await prisma.accessToken.update({
              where: { id: accessToken.id }, // Use unique id for update
              data: { isRevoked: true },
            });
          }
        }
        // 如果令牌不属于此客户端，或已撤销，或无效，RFC 7009仍要求返回200 (If token doesn't belong or already revoked/invalid, RFC 7009 still requires 200 OK)
      }
    }

    // 如果没有作为访问令牌处理（或者即使处理了也尝试作为刷新令牌，以防token值冲突），并且提示是 refresh_token 或没有提示
    // (If not processed as access token (or even if processed, try as refresh token in case of token value collision), and hint is refresh_token or no hint)
    if (!tokenProcessed && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
      const refreshToken = await prisma.refreshToken.findUnique({
        where: { token: token }, // Search by actual token value
      });
      if (refreshToken) {
        // tokenProcessed = true; // Not strictly needed due to always returning 200
        if (refreshToken.clientId === client.id) { // 确保令牌属于认证的客户端 (Ensure token belongs to authenticated client)
          if (!refreshToken.isRevoked) {
            await prisma.refreshToken.update({
              where: { id: refreshToken.id }, // Use unique id for update
              data: { isRevoked: true },
            });
            // RFC 7009: "if a refresh token is_revoked, the authorization server SHOULD also invalidate all access tokens
            // based on the same authorization grant." - This is an advanced step not currently implemented.
          }
        }
        // 同上，RFC 7009 要求返回200 (Same as above, RFC 7009 requires 200 OK)
      }
    }

    // 3. 响应生成 (Response Generation) - RFC 7009: 始终返回200 OK (Always return 200 OK)
    // RFC 7009: 始终返回200 OK (Always return 200 OK)
    return new NextResponse(null, { status: 200 });

  } catch (error) {
    console.error('Revocation error:', error);
    // 对于服务器内部错误，返回500，响应体应为空
    // (For internal server errors, return 500, response body should be empty)
    return new NextResponse(null, { status: 500 });
  }
}
