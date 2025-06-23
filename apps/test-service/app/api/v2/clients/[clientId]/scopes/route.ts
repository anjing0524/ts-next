// /api/v2/clients/[clientId]/scopes

import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/v2/clients/{clientId}/scopes:
 *   get:
 *     summary: 获取客户端允许的权限范围 (OAuth客户端管理)
 *     description: 获取指定OAuth客户端当前被授权允许使用的权限范围列表。
 *     tags: [OAuth Clients API]
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         description: 客户端ID。
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取客户端的权限范围。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientId:
 *                   type: string
 *                 allowedScopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 客户端允许的权限范围列表。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到客户端。
 *   put:
 *     summary: 更新客户端允许的权限范围 (OAuth客户端管理)
 *     description: 更新或替换指定OAuth客户端被授权允许使用的权限范围列表。
 *     tags: [OAuth Clients API]
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         description: 客户端ID。
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scopes
 *             properties:
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 新的权限范围列表。
 *                 example: ["openid", "profile", "email", "order:read"]
 *     responses:
 *       200:
 *         description: 客户端权限范围已成功更新。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientId:
 *                   type: string
 *                 allowedScopes:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: 无效请求，例如请求体格式错误或权限范围无效。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到客户端。
 */
export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  // TODO: 实现获取客户端允许的权限范围的逻辑 (Implement logic to get client allowed scopes)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 clientId。
  // 3. 查询数据库获取客户端信息，特别是其 allowedScopes 字段。
  // 4. 返回权限范围列表。
  const { clientId } = params;
  console.log(`GET scopes for clientId: ${clientId}`);
  return NextResponse.json({
    clientId: clientId,
    allowedScopes: ['openid', 'profile', 'email'] // 示例数据 (Example data)
  });
}

export async function PUT(request: Request, { params }: { params: { clientId: string } }) {
  // TODO: 实现更新客户端允许的权限范围的逻辑 (Implement logic to update client allowed scopes)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 clientId。
  // 3. 解析请求体中的 scopes 数组。
  // 4. 验证所有提供的 scope 是否是系统中已定义的有效 Scope。
  // 5. 更新数据库中该客户端的 allowedScopes 字段。
  // 6. 返回更新后的权限范围列表。
  const { clientId } = params;
  const body = await request.json();
  console.log(`PUT scopes for clientId: ${clientId}, new scopes:`, body.scopes);
  return NextResponse.json({
    clientId: clientId,
    allowedScopes: body.scopes // 示例数据 (Example data)
  });
}
