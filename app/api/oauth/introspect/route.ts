// app/api/oauth/introspect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // 导入 Prisma 客户端 (Import Prisma client)

// 临时资源服务器认证API密钥 (Temporary Resource Server Authentication API Key)
const RESOURCE_SERVER_API_KEY = 'temp-resource-server-api-key';
// 你的认证服务器的颁发者URL (Your auth server's issuer URL)
const ISSUER_URL = process.env.ISSUER_URL || 'https://your-auth-server.com/oauth';


export async function POST(req: NextRequest) {
  // 验证资源服务器 (Authenticate the resource server)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // 根据 RFC 7662，如果资源服务器认证失败，应该返回401或403，但响应体不应包含 active: false
    // RFC 7662 states that if resource server authentication fails, it should return 401 or 403,
    // but the response body should not include active: false.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const apiKey = authHeader.substring(7); // 从 "Bearer " 后提取API密钥 (Extract API key after "Bearer ")
  if (apiKey !== RESOURCE_SERVER_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const formData = await req.formData();
    const token = formData.get('token') as string;
    const tokenTypeHint = formData.get('token_type_hint') as string | undefined;

    if (!token) {
      // RFC 7662: "The request is missing a required parameter, includes an
      // unsupported parameter or parameter value, repeats a parameter,
      // includes multiple credentials, utilizes more than one mechanism for
      // authenticating the client, or is otherwise malformed."
      // For missing token, return active: false directly.
      return NextResponse.json({ active: false, error: 'token_missing' }, { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let dbToken = null;
    let tokenType = ''; // 'access_token' or 'refresh_token'

    // 根据 token_type_hint 或同时检查 AccessToken 和 RefreshToken 表
    // (Check AccessToken and RefreshToken tables based on token_type_hint or both)
    if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
      dbToken = await prisma.accessToken.findUnique({
        where: { token },
        include: { user: true, client: true }, // 包含关联的 User 和 Client (Include related User and Client)
      });
      if (dbToken) tokenType = 'access_token';
    }

    if (!dbToken && (tokenTypeHint === 'refresh_token' || !tokenTypeHint)) {
      dbToken = await prisma.refreshToken.findUnique({
        where: { token },
        include: { user: true, client: true }, // 包含关联的 User 和 Client (Include related User and Client)
      });
      if (dbToken) tokenType = 'refresh_token';
    }

    // 验证令牌是否存在、是否过期、是否已被撤销
    // (Verify if the token exists, is expired, and is not revoked)
    if (!dbToken || dbToken.expiresAt < new Date() || dbToken.isRevoked) { // Changed revokedAt to isRevoked
      return NextResponse.json({ active: false }, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 令牌有效，构建响应 (Token is valid, construct the response)
    const responseBody: Record<string, any> = {
      active: true,
      scope: dbToken.scope, // Changed scopes.join(' ') to scope
      client_id: dbToken.clientId,
      exp: Math.floor(dbToken.expiresAt.getTime() / 1000),
      iat: Math.floor(dbToken.createdAt.getTime() / 1000),
      iss: ISSUER_URL,
    };

    if (dbToken.userId) {
      responseBody.sub = dbToken.userId;
      // 假设 User 模型中有 username 字段 (Assume User model has a username field)
      if (dbToken.user && dbToken.user.email) { // Accessing email as username, adjust if your schema is different
        responseBody.username = dbToken.user.email;
      }
    }

    // 根据令牌类型添加特定声明 (Add claims specific to token type if necessary)
    // For example, 'jti' (JWT ID) could be added if it's stored with the token
    // responseBody.jti = dbToken.id; // Assuming 'id' is the JWT ID

    return NextResponse.json(responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Introspection error:', error);
    // RFC 7662 doesn't explicitly define server error response format, but returning active:false is safest.
    // However, a 500 status code is more appropriate for server errors.
    // Consider if active:false should be returned here or just an error object.
    // For now, returning a generic error to avoid leaking token status on internal errors.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
