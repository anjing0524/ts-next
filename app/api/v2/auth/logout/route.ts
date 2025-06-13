// 文件路径: app/api/v2/auth/logout/route.ts
// 描述: 用户登出端点 (User logout endpoint)

import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils } from '@/lib/auth/oauth2'; // 假设 JWTUtils 包含验证V2认证令牌的方法

// 辅助函数：构建响应 (Helper function: Build response)
function buildResponse(message: string, status: number, data?: Record<string, any>) {
  const responseBody = { message, ...data };
  // 对于一些成功但无具体内容的响应，可以考虑返回状态码204 No Content，此时响应体应为空
  // (For some successful responses without specific content, consider returning status 204 No Content, response body should be empty then)
  // if (status === 204) {
  //   return new NextResponse(null, { status });
  // }
  return NextResponse.json(responseBody, { status });
}

export async function POST(req: NextRequest) {
  // 1. 从 Authorization 头提取令牌 (Extract token from Authorization header)
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    // 即使用户尝试登出，如果请求格式不正确，仍可认为用户会话无效或已结束
    // (Even if user is logging out, if request format is incorrect, user session can be considered invalid or ended)
    // 返回200，鼓励客户端清除本地存储的令牌 (Return 200 to encourage client to clear locally stored tokens)
    return buildResponse('Logout processed (malformed authorization header). Please discard any local tokens.', 200);
  }

  const token = authHeader.substring(7); // 提取 "Bearer " 后的令牌部分 (Extract token part after "Bearer ")

  if (!token) {
    // 如果没有令牌，用户实际上已经“登出”了
    // (If no token, user is effectively already "logged out")
    return buildResponse('Logout processed (no token provided).', 200);
  }

  try {
    // 2. 验证令牌 (Validate the token)
    // 假设 JWTUtils 中有一个 verifyV2AuthAccessToken 方法用于验证会话访问令牌
    // (Assuming JWTUtils has a verifyV2AuthAccessToken method for session access tokens)
    // 此方法应能验证签名、有效期，并可能检查令牌是否用于正确的“audience”（例如 'urn:api:v2:session'）
    // (This method should verify signature, expiry, and potentially check for correct 'audience', e.g. 'urn:api:v2:session')
    const { valid, payload, error } = await JWTUtils.verifyV2AuthAccessToken(token);

    if (!valid) {
      // 即便令牌无效或过期，从客户端角度看，用户也已不再是有效会话状态
      // (Even if token is invalid or expired, from client's perspective, user is no longer in a valid session state)
      console.warn(`Logout attempt with invalid or expired token. Token: ${token.substring(0, 10)}... Error: ${error}`);
      // 返回200，让客户端继续执行登出流程（清除本地令牌）
      // (Return 200, let client proceed with logout flow (clear local tokens))
      return buildResponse('Logout processed. Token was invalid, expired, or could not be verified.', 200);
    }

    // 可选：记录用户登出事件 (Optional: Log user logout event)
    if (payload?.userId) {
      console.log(`User ${payload.userId} initiated logout successfully with token ${token.substring(0,10)}...`);
      // 在这里可以添加审计日志记录 (Audit logging can be added here)
      // await prisma.auditLog.create({ data: { userId: payload.userId, action: 'logout', ... } });
    } else {
      console.log(`Logout processed for token ${token.substring(0,10)}... (userId not in payload or payload missing)`);
    }


    // 3. 令牌失效处理 (Token Invalidation Strategy)
    // 当前采用无状态确认方式 (Currently using stateless acknowledgment)
    // 服务器不维护已颁发V2会话JWT的拒绝列表。客户端负责丢弃令牌。
    // (Server does not maintain a denylist for issued V2 session JWTs. Client is responsible for discarding tokens.)
    //
    // 对于更强的安全性，可以考虑:
    // (For stronger security, consider):
    //   a) 短期访问令牌：它们会自然过期。 (Short-lived access tokens: they expire naturally.)
    //   b) 如果使用了刷新令牌：客户端应在登出时明确请求撤销刷新令牌（如果服务器支持）。
    //      (If refresh tokens are used: client should explicitly request revocation of refresh token on logout if server supports it.)
    //      这通常需要一个额外的参数，如 { "refreshToken": "..." }，并在后端实现刷新令牌的拒绝列表。
    //      (This usually requires an additional parameter like { "refreshToken": "..." } and implementing a refresh token denylist on backend.)

    // 4. 返回成功响应 (Return success response)
    // 指示客户端清除其存储的令牌 (Instruct client to clear its stored tokens)
    return buildResponse('Logged out successfully. Please discard your local tokens.', 200);

  } catch (e: any) {
    // 捕获 JWTUtils.verifyV2AuthAccessToken 可能抛出的其他未预料的异常
    // (Catch other unexpected exceptions that JWTUtils.verifyV2AuthAccessToken might throw)
    console.error('Unexpected error during logout token verification:', e);
    // 即使验证过程中出现异常，也返回200，因为目的是让客户端清除状态
    // (Even if an exception occurs during verification, return 200 as the goal is for client to clear state)
    return buildResponse('Logout processed with a server-side error during token check. Please discard your local tokens.', 200);
  }
}

// 在 lib/auth/oauth2.ts 的 JWTUtils 中需要一个类似下面的方法：
// (A method like the one below is needed in JWTUtils within lib/auth/oauth2.ts)
// 它的实现会类似于 verifyAccessToken，但可能针对不同的 audience 或 claim 结构
// (Its implementation would be similar to verifyAccessToken, but possibly for a different audience or claim structure)
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    // ... other existing JWTUtils methods (createV2AuthAccessToken, createV2AuthRefreshToken, etc.)
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; username: string; aud?: string; roles?: string[]; [key: string]: any }; // 扩展的载荷类型 (Extended payload type)
      error?: string; // 错误信息 (Error message)
    }>;
  }
}
