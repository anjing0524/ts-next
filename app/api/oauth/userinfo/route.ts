// app/api/oauth/userinfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// Import User type for clarity, though prisma client returns typed objects.
// We need to ensure fields like `emailVerified` and `phoneVerified` exist on the User model in schema.prisma.
// import { User } from '@prisma/client';

// 辅助函数：解析范围字符串 (Helper function: Parse scope string)
// 假设范围在数据库中存储为空格分隔的字符串 (Assuming scopes are stored as space-separated string in DB)
function parseScopesToArray(scopeString: string | null | undefined): string[] {
  if (!scopeString) {
    return [];
  }
  return scopeString.split(' ').filter(s => s.length > 0);
}

export async function GET(req: NextRequest) {
  // 1. 访问令牌处理 (Access Token Handling)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Authorization header with Bearer token is required.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="invalid_request", error_description="Authorization header with Bearer token is required."' } }
    );
  }

  const tokenValue = authHeader.substring(7); // 提取令牌 (Extract token after "Bearer ")
  if (!tokenValue) {
    return NextResponse.json(
      { error: 'invalid_token', error_description: 'Bearer token is missing.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="invalid_token", error_description="Bearer token is missing."' } }
    );
  }

  try {
    // 2. 访问令牌验证 (Access Token Validation)
    const accessToken = await prisma.accessToken.findUnique({
      where: { token: tokenValue }, // 按实际令牌值查找 (Find by actual token value)
      include: { user: true },    // 包含关联的用户信息 (Include related user information)
    });

    if (!accessToken) {
      return NextResponse.json(
        { error: 'invalid_token', error_description: 'Access token not found.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="invalid_token", error_description="Access token not found."' } }
      );
    }

    if (accessToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'invalid_token', error_description: 'Access token expired.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="invalid_token", error_description="Access token expired."' } }
      );
    }

    if (accessToken.isRevoked) {
      return NextResponse.json(
        { error: 'invalid_token', error_description: 'Access token revoked.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="invalid_token", error_description="Access token revoked."' } }
      );
    }

    // 确保用户存在 (Ensure user exists)
    if (!accessToken.userId || !accessToken.user) {
        console.error(`User ID missing or user not populated for AccessToken ID: ${accessToken.id}`);
        return NextResponse.json(
            { error: 'server_error', error_description: 'Associated user not found for the token.' },
            { status: 500 }
        );
    }
    const user = accessToken.user;

    // 3. 范围验证和声明检索 (Scope Validation & Claims Retrieval)
    const grantedScopes = parseScopesToArray(accessToken.scope);

    if (!grantedScopes.includes('openid')) {
      return NextResponse.json(
        { error: 'insufficient_scope', error_description: 'The "openid" scope is required to access userinfo.' },
        { status: 403, headers: { 'WWW-Authenticate': 'Bearer realm="userinfo", error="insufficient_scope", error_description="The openid scope is required."' } }
      );
    }

    // 4. 响应生成 (OIDC Core 1.0 compliant Response Generation)
    const claims: Record<string, any> = {
      sub: user.id, // 'sub' (subject) 声明始终返回 (Subject claim is always returned)
    };

    // 基于范围包含声明 (Include claims based on scopes)
    if (grantedScopes.includes('profile')) {
      // OIDC 'name' claim: Full name
      claims.name = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || null;
      if (user.firstName) claims.given_name = user.firstName;
      if (user.lastName) claims.family_name = user.lastName;
      // 'preferred_username' can be the login username or a display name the user prefers.
      claims.preferred_username = user.username; // Assuming 'username' is the primary login identifier
      if (user.displayName && user.displayName !== user.username) claims.nickname = user.displayName; // Or some other field for nickname

      // 'profile' could be a URL to a user-managed profile page.
      // claims.profile = user.profileUrl || null;

      // 'picture' is the avatar URL
      if (user.avatar) claims.picture = user.avatar;

      // 'website' could be user.website if such a field exists
      // claims.website = user.website || null;

      // 'gender', 'birthdate', 'zoneinfo', 'locale' are other profile claims if available

      claims.updated_at = Math.floor(user.updatedAt.getTime() / 1000); // OIDC standard claim
    }

    if (grantedScopes.includes('email')) {
      if (user.email) claims.email = user.email;
      // 'email_verified' must be true or false. Include only if the field exists on the User model and is a boolean.
      if (typeof user.emailVerified === 'boolean') {
        claims.email_verified = user.emailVerified;
      }
    }

    if (grantedScopes.includes('phone')) {
      if (user.phone) claims.phone_number = user.phone;
      // 'phone_number_verified' must be true or false. Include only if the field exists on the User model and is a boolean.
      if (typeof user.phoneVerified === 'boolean') {
        claims.phone_number_verified = user.phoneVerified;
      }
    }

    // 移除所有值为 null 的声明 (Remove all claims with null values)
    // Undefined values are automatically omitted by JSON.stringify
    Object.keys(claims).forEach(key => claims[key] === null && delete claims[key]);

    return NextResponse.json(claims, { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Userinfo endpoint error:', error);
    // Avoid sending detailed error messages in production for security
    return NextResponse.json(
        { error: 'server_error', error_description: 'An unexpected error occurred while processing user information.' },
        { status: 500 }
    );
  }
}

// POST method for UserInfo endpoint (OIDC spec allows POST with form-encoded access_token or Bearer token)
export async function POST(req: NextRequest) {
  // OIDC allows token via form body for POST: 'access_token=<value>' with Content-Type application/x-www-form-urlencoded
  // However, Bearer token in Authorization header is preferred and more common.
  // This implementation will prioritize Bearer token from Auth header, similar to GET.
  // If specific support for token in body for POST is needed, logic to parse formData
  // and extract 'access_token' would be added here if Authorization header is missing/invalid.

  // For now, we delegate to GET which primarily checks Authorization header.
  // This means POST requests must also use the Authorization: Bearer token header.
  return GET(req);
}
