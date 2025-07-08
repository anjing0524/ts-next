// apps/oauth-service/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateBearer } from '@repo/lib/middleware';
import { permissionMap } from './lib/permission-map';
import { match } from 'path-to-regexp';
import { HttpMethod } from '@prisma/client';

export const config = {
  matcher: '/api/v2/:path*',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method as HttpMethod;

  // 公共路径，直接放行
  if (pathname === '/api/v2/health' || pathname.startsWith('/api/v2/.well-known')) {
    return NextResponse.next();
  }

  // /users/me 路由，仅验证登录状态
  if (pathname === '/api/v2/users/me') {
    const authResult = await authenticateBearer(request, {});
    if (!authResult.success || !authResult.context) {
      return authResult.response || NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const headers = new Headers(request.headers);
    headers.set('X-User-Id', authResult.context.user_id || '');
    return NextResponse.next({ request: { headers } });
  }

  // 从权限图中查找匹配的规则
  const matchedPath = Object.keys(permissionMap).find((path) => match(path)(pathname));

  if (!matchedPath) {
    return NextResponse.json(
      { message: `Endpoint [${method}] ${pathname} not found or access is forbidden.` },
      { status: 404 }
    );
  }

  const requiredPermission = permissionMap[matchedPath]![method];

  if (!requiredPermission) {
    return NextResponse.json(
      { message: `Method ${method} not allowed for ${pathname}.` },
      { status: 405 }
    );
  }

  // 执行认证和权限检查
  const authResult = await authenticateBearer(request, {
    requiredPermissions: [requiredPermission],
  });

  if (!authResult.success || !authResult.context) {
    return authResult.response || NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // 注入用户信息到请求头
  const headers = new Headers(request.headers);
  headers.set('X-User-Id', authResult.context.user_id || '');
  headers.set('X-Client-Id', authResult.context.client_id || '');
  headers.set('X-User-Permissions', authResult.context.permissions.join(','));

  return NextResponse.next({ request: { headers } });
}
