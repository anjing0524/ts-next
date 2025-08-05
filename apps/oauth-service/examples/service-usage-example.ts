/**
 * 服务容器使用示例
 * 展示如何在 API 端点中使用服务容器
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer, createServiceFactory } from '@/lib/auth/service-container';
import { withErrorHandling } from '@repo/lib/node';

/**
 * 示例：使用服务容器的用户管理 API
 */
async function getUserHandler(request: NextRequest, _context: any): Promise<NextResponse> {
  const container = getServiceContainer();
  const userService = container.getUserService();
  const rbacService = container.getRBACService();
  
  // 获取用户ID
  const userId = request.nextUrl.searchParams.get('id');
  
  if (!userId) {
    return NextResponse.json(
      { error: 'user_id_required' },
      { status: 400 }
    );
  }
  
  // 获取用户信息
  const user = await userService.getUserById(userId);
  
  if (!user) {
    return NextResponse.json(
      { error: 'user_not_found' },
      { status: 404 }
    );
  }
  
  // 获取用户权限
  const permissions = await rbacService.getUserPermissionsArr(userId);
  
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
    permissions,
  });
}

/**
 * 示例：使用依赖注入的服务类
 */
class UserController {
  constructor(private container: any) {}
  
  async createUser(request: NextRequest): Promise<NextResponse> {
    const userService = this.container.getUserService();
    const rbacService = this.container.getRBACService();
    
    const body = await request.json();
    
    // 创建用户
    const user = await userService.createUser(body);
    
    // 分配默认角色
    await rbacService.assignRoleToUser(user.id, 'USER');
    
    return NextResponse.json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
      }
    }, { status: 201 });
  }
}

/**
 * 导出 API 端点
 */
export const GET = withErrorHandling(getUserHandler);

// 使用工厂函数创建控制器
// const createUserController = createServiceFactory(UserController);

// 在其他地方使用
// export const POST = withErrorHandling((req) => {
//   const controller = createUserController();
//   return controller.createUser(req);
// });