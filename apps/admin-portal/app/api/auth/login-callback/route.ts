import { NextRequest, NextResponse } from 'next/server';

/**
 * Token 存储端点 - 用于设置 HTTP-Only Cookie
 *
 * 在 OAuth 授权码交换后，由前端调用此端点来设置 token 相关的 HTTP-Only Cookie。
 * 这样可以使 token 对 XSS 攻击更加安全。
 *
 * 工作流程：
 * 1. /auth/callback 页面从 OAuth Service 获取授权码
 * 2. /auth/callback 使用授权码交换 access_token 和 refresh_token
 * 3. /auth/callback 调用此端点来设置 HTTP-Only Cookie
 * 4. Token 既存储在 HTTP-Only Cookie（用于服务器请求）
 *    也存储在 localStorage（用于前端 JS 使用）
 *
 * 请求参数：
 * - access_token: JWT access token（用于 API 请求认证）
 * - refresh_token: 刷新令牌（用于获取新的 access_token）
 * - user_id: 用户ID（可选）
 *
 * 安全特性：
 * - HttpOnly: 防止 JavaScript 访问（保护 XSS 攻击）
 * - Secure: 仅在 HTTPS 传输（生产环境）
 * - SameSite=Lax: 防止 CSRF 攻击
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { access_token, refresh_token, user_id } = body;

    if (!access_token) {
      return NextResponse.json(
        { error: 'Missing access token' },
        { status: 400 }
      );
    }

    // 创建响应
    const response = NextResponse.json({
      success: true,
      redirect: '/dashboard'
    });

    // 设置访问令牌 cookie
    response.cookies.set('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
      path: '/'
    });

    // 设置刷新令牌 cookie
    if (refresh_token) {
      response.cookies.set('refresh_token', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 604800, // 7 days
        path: '/'
      });
    }

    // 存储用户ID
    if (user_id) {
      response.cookies.set('user_id', user_id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 604800,
        path: '/'
      });
    }

    return response;
  } catch (error) {
    console.error('Login callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 处理重定向形式的回调（GET 请求）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (!accessToken) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    // 创建重定向响应
    const response = NextResponse.redirect(new URL('/dashboard', request.url));

    // 设置令牌 cookies
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/'
    });

    if (refreshToken) {
      response.cookies.set('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 604800,
        path: '/'
      });
    }

    return response;
  } catch (error) {
    console.error('Login GET callback error:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}
