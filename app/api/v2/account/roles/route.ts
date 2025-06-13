// /api/v2/account/roles

import { NextResponse } from 'next/server';
// import { getCurrentUser } from '~/server/auth';
// import { prisma } from '~/server/db';

/**
 * @swagger
 * /api/v2/account/roles:
 *   get:
 *     summary: 获取当前用户的角色 (个人账户管理)
 *     description: 检索当前已认证用户被分配的所有角色列表。
 *     tags: [Account API]
 *     responses:
 *       200:
 *         description: 成功获取用户角色列表。
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: # Role ID
 *                     type: string
 *                   name: # Role name, e.g., "USER_ADMIN", "CONTENT_EDITOR"
 *                     type: string
 *                   displayName:
 *                     type: string
 *                   description:
 *                     type: string
 *                     nullable: true
 *       401:
 *         description: 用户未认证。
 */
export async function GET(request: Request) {
  // TODO: 实现获取当前用户角色的逻辑 (Implement logic to get current user's roles)
  // 1. 获取当前已认证的用户信息.
  // 2. 通过 UserRole 关联表查询该用户的所有 Role 记录.
  // 3. 返回角色列表.
  console.log('GET /api/v2/account/roles request');
  // const currentUser = await getCurrentUser(request);
  // if (!currentUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // const userRoles = await prisma.userRole.findMany({
  //   where: { userId: currentUser.id },
  //   include: { role: true }
  // });
  // const roles = userRoles.map(ur => ur.role);

  // 示例数据 (Example data)
  const exampleRoles = [
    { id: 'role_user', name: 'USER', displayName: '普通用户', description: '标准用户权限' },
    { id: 'role_editor', name: 'CONTENT_EDITOR', displayName: '内容编辑', description: '可以编辑网站内容' }
  ];
  return NextResponse.json(exampleRoles);
}
