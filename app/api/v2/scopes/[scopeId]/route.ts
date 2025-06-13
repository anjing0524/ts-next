// /api/v2/scopes/[scopeId]

import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/v2/scopes/{scopeId}:
 *   get:
 *     summary: 获取特定权限范围的详细信息 (OAuth Scope管理)
 *     description: 根据ID获取系统中特定OAuth权限范围的详细信息。
 *     tags: [OAuth Scopes API]
 *     parameters:
 *       - name: scopeId
 *         in: path
 *         required: true
 *         description: 权限范围的ID。
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取权限范围信息。
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
 *                 isPublic:
 *                   type: boolean
 *                 isActive:
 *                   type: boolean
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到指定的权限范围。
 *   put:
 *     summary: 更新特定权限范围的信息 (OAuth Scope管理)
 *     description: 更新系统中特定OAuth权限范围的详细信息 (例如描述, isPublic, isActive状态)。名称通常不可修改。
 *     tags: [OAuth Scopes API]
 *     parameters:
 *       - name: scopeId
 *         in: path
 *         required: true
 *         description: 权限范围的ID。
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 description: 权限范围的可读描述。
 *               isPublic:
 *                 type: boolean
 *                 description: 是否为公开范围。
 *               isActive:
 *                 type: boolean
 *                 description: 此权限范围当前是否激活可用。
 *     responses:
 *       200:
 *         description: 权限范围已成功更新。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               # Schema should match the GET response
 *       400:
 *         description: 无效请求。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到指定的权限范围。
 *   delete:
 *     summary: 删除特定权限范围 (OAuth Scope管理)
 *     description: 从系统中删除一个OAuth权限范围。如果该范围仍被客户端使用，可能需要特殊处理或阻止删除。
 *     tags: [OAuth Scopes API]
 *     parameters:
 *       - name: scopeId
 *         in: path
 *         required: true
 *         description: 权限范围的ID。
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 权限范围已成功删除。
 *       400:
 *         description: 无法删除，例如权限范围正在被使用。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到指定的权限范围。
 */
export async function GET(request: Request, { params }: { params: { scopeId: string } }) {
  // TODO: 实现获取特定权限范围详细信息的逻辑 (Implement logic to get specific scope details)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 scopeId。
  // 3. 从数据库查询 Scope 记录。
  // 4. 返回权限范围信息。
  const { scopeId } = params;
  console.log(`GET /api/v2/scopes/${scopeId} request`);
  return NextResponse.json({
    id: scopeId,
    name: 'example:scope',
    description: 'An example scope',
    isPublic: false,
    isActive: true
  });
}

export async function PUT(request: Request, { params }: { params: { scopeId: string } }) {
  // TODO: 实现更新特定权限范围信息的逻辑 (Implement logic to update specific scope info)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 scopeId。
  // 3. 解析请求体数据。
  // 4. 更新数据库中的 Scope 记录。
  // 5. 返回更新后的权限范围信息。
  const { scopeId } = params;
  const body = await request.json();
  console.log(`PUT /api/v2/scopes/${scopeId} request, body:`, body);
  return NextResponse.json({
    id: scopeId,
    ...body
  });
}

export async function DELETE(request: Request, { params }: { params: { scopeId: string } }) {
  // TODO: 实现删除特定权限范围的逻辑 (Implement logic to delete a specific scope)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 scopeId。
  // 3. 检查该权限范围是否仍被某些客户端的 allowedScopes 引用，或是否存在于 RolePermission 中。
  //    (根据业务规则决定是阻止删除，还是级联移除引用，或标记为禁用)
  // 4. 从数据库删除 Scope 记录。
  // 5. 返回成功响应 (204 No Content)。
  const { scopeId } = params;
  console.log(`DELETE /api/v2/scopes/${scopeId} request`);
  return new NextResponse(null, { status: 204 });
}
