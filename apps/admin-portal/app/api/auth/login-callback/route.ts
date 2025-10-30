import { NextRequest, NextResponse } from 'next/server';

/**
 * Login 回调处理端点
 * 在用户通过用户名密码登录后被重定向到此端点
 *
 * 预期的请求来源：OAuth Service 的 /api/v2/auth/login 端点
 * 参数：
 * - access_token: JWT token 用于认证
 * - refresh_token: 刷新令牌
 * - user_id: 用户ID
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
