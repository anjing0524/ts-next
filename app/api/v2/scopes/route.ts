// /api/v2/scopes

import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/v2/scopes:
 *   get:
 *     summary: 列出所有可用权限范围 (OAuth Scope管理)
 *     description: 获取系统中所有已定义的OAuth权限范围 (scopes)。
 *     tags: [OAuth Scopes API]
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         description: 页码。
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         required: false
 *         description: 每页数量。
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 成功获取权限范围列表。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       isPublic:
 *                         type: boolean
 *                       isActive:
 *                         type: boolean
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *   post:
 *     summary: 创建新的权限范围 (OAuth Scope管理)
 *     description: 在系统中定义一个新的OAuth权限范围。
 *     tags: [OAuth Scopes API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: 权限范围的唯一名称 (例如 "order:read", "user:profile:write")。
 *                 example: "product:manage"
 *               description:
 *                 type: string
 *                 description: 权限范围的可读描述。
 *                 example: "允许管理产品信息"
 *               isPublic:
 *                 type: boolean
 *                 description: 是否为公开范围 (公开客户端通常只能请求公开范围)。默认为 false。
 *                 default: false
 *               isActive:
 *                 type: boolean
 *                 description: 此权限范围当前是否激活可用。默认为 true。
 *                 default: true
 *     responses:
 *       211: # Should be 201 for Created
 *         description: 权限范围已成功创建。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *       400:
 *         description: 无效请求，例如名称已存在或格式错误。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 */
export async function GET(request: Request) {
  // TODO: 实现列出所有权限范围的逻辑 (Implement logic to list all scopes)
  // 1. 验证用户权限。
  // 2. 支持分页查询 (page, limit)。
  // 3. 从数据库查询 Scope 记录。
  // 4. 返回权限范围列表及分页信息。
  console.log('GET /api/v2/scopes request');
  return NextResponse.json({
    data: [
      { id: 'scope1', name: 'openid', description: 'OIDC scope', isPublic: true, isActive: true },
      { id: 'scope2', name: 'profile', description: 'User profile access', isPublic: true, isActive: true },
    ],
    pagination: { page: 1, limit: 10, total: 2 }
  });
}

export async function POST(request: Request) {
  // TODO: 实现创建新权限范围的逻辑 (Implement logic to create a new scope)
  // 1. 验证用户权限。
  // 2. 解析请求体中的权限范围数据 (name, description, isPublic, isActive)。
  // 3. 验证 name 是否唯一。
  // 4. 创建新的 Scope 记录到数据库。
  // 5. 返回新创建的权限范围信息。
  const body = await request.json();
  console.log('POST /api/v2/scopes request, body:', body);
  return NextResponse.json({
    id: `new_scope_${Math.random().toString(36).substring(2)}`,
    ...body
  }, { status: 201 });
}
