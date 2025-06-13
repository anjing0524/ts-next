// /api/v2/system/configurations/[configKey]

import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/v2/system/configurations/{configKey}:
 *   get:
 *     summary: 获取特定系统配置项 (系统配置管理)
 *     description: 根据键名检索特定的系统配置项及其当前值。
 *     tags: [System API - Configurations]
 *     parameters:
 *       - name: configKey
 *         in: path
 *         required: true
 *         description: 配置项的键名。
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取系统配置项。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                 value:
 *                   type: any
 *                 description:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [string, number, boolean, json]
 *                 isEditable:
 *                   type: boolean
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到指定的配置项。
 *   put:
 *     summary: 更新特定系统配置项 (系统配置管理)
 *     description: 更新特定系统配置项的值。只允许更新 `isEditable=true` 的配置项。
 *     tags: [System API - Configurations]
 *     parameters:
 *       - name: configKey
 *         in: path
 *         required: true
 *         description: 配置项的键名。
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: any # Value type should match the 'type' defined for the key
 *                 description: 配置项的新值。
 *           example:
 *             value: "New Site Name"
 *     responses:
 *       200:
 *         description: 系统配置项已成功更新。
 *         content:
 *           application/json:
 *             schema:
 *               # Schema for a single configuration item
 *               type: object
 *       400:
 *         description: 无效请求，例如尝试更新不可编辑的配置项或值类型不匹配。
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 *       404:
 *         description: 未找到指定的配置项。
 */
export async function GET(request: Request, { params }: { params: { configKey: string } }) {
  // TODO: 实现获取特定系统配置项的逻辑 (Implement logic to get a specific system configuration)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 configKey。
  // 3. 从数据库查询 SystemConfiguration 记录。
  // 4. 如果配置项敏感，可能需要隐藏或部分屏蔽其值。
  // 5. 返回配置项信息。
  const { configKey } = params;
  console.log(`GET /api/v2/system/configurations/${configKey} request`);
  // 示例：模拟查找 (Example: simulate find)
  if (configKey === "SITE_NAME") {
    return NextResponse.json({
      key: configKey,
      value: 'Current Site Name from DB',
      description: 'Public name of the website',
      type: 'string',
      isEditable: true
    });
  }
  return NextResponse.json({ message: `Configuration with key ${configKey} not found.` }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: { configKey: string } }) {
  // TODO: 实现更新特定系统配置项的逻辑 (Implement logic to update a specific system configuration)
  // 1. 验证用户权限。
  // 2. 从路径参数中获取 configKey。
  // 3. 解析请求体中的 value。
  // 4. 验证 configKey 是否存在。
  // 5. 验证配置项是否可编辑 (isEditable=true)。
  // 6. 验证 value 的类型是否与配置项定义的 type 匹配。
  // 7. 更新数据库中的 SystemConfiguration 记录。
  // 8. 返回更新后的配置项信息。
  const { configKey } = params;
  const body = await request.json();
  console.log(`PUT /api/v2/system/configurations/${configKey} request, value:`, body.value);
  // 示例：模拟更新 (Example: simulate update)
  if (configKey === "SITE_NAME_EDITABLE") { // Assume this one exists and is editable
     return NextResponse.json({
      key: configKey,
      value: body.value,
      description: 'Updated description',
      type: 'string',
      isEditable: true,
      status: 'updated'
    });
  }
  return NextResponse.json({ message: `Configuration with key ${configKey} not found or not editable.` }, { status: 404 });
}
