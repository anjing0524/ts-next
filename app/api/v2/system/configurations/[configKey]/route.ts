// /api/v2/system/configurations/[configKey]
// 描述: 管理特定系统配置项 - 获取详情和更新。
// (Manages specific system configuration item - Get details and Update.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { Prisma, SystemConfiguration } from '@prisma/client';

interface RouteContext {
  params: {
    configKey: string; // 配置项的键名 (The key of the configuration item)
  };
}

// Zod Schema for updating a single system configuration item's value
// 更新单个系统配置项值的Zod Schema
const SingleSystemConfigUpdatePayloadSchema = z.object({
  value: z.any(), // Value can be string, number, boolean, or object/array for JSON type
});

// 辅助函数：根据存储的类型转换值
// (Helper function: Convert value based on its stored type)
function parseConfigValue(value: string, type: string): any {
  try {
    if (type === 'boolean') return value === 'true';
    if (type === 'number') return parseFloat(value);
    if (type === 'json') return JSON.parse(value);
    return value; // string or other
  } catch (e) {
    console.error(`Error parsing config value '${value}' of type '${type}':`, e);
    return value; // Return original string if parsing fails
  }
}

// 辅助函数：格式化配置项以用于响应
// (Helper function: Format configuration item for response)
function formatConfigForResponse(config: SystemConfiguration | null): any {
  if (!config) return null;
  return {
    ...config,
    value: parseConfigValue(config.value, config.type),
  };
}

/**
 * @swagger
 * /api/v2/system/configurations/{configKey}:
 *   get:
 *     summary: 获取特定系统配置项 (系统配置管理)
 *     description: 根据键名检索特定的系统配置项及其当前值。需要 'system:configurations:read' 权限。
 *     tags: [System API - Configurations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: configKey {description: "配置项的键名。"}
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "成功获取系统配置项。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 *       404: { description: "未找到指定的配置项。" }
 */
async function getSingleSystemConfigurationHandler(request: AuthenticatedRequest, context: RouteContext) {
  const { configKey } = context.params;

  try {
    const configItem = await prisma.systemConfiguration.findUnique({
      where: { key: configKey },
    });

    if (!configItem) {
      return NextResponse.json({ message: `Configuration with key '${configKey}' not found.` }, { status: 404 });
    }
    return NextResponse.json(formatConfigForResponse(configItem));
  } catch (error) {
    console.error(`Error fetching system configuration '${configKey}':`, error);
    return NextResponse.json({ message: `Error fetching configuration for key '${configKey}'.` }, { status: 500 });
  }
}
export const GET = requirePermission('system:configurations:read')(getSingleSystemConfigurationHandler);


/**
 * @swagger
 * /api/v2/system/configurations/{configKey}:
 *   put:
 *     summary: 更新特定系统配置项 (系统配置管理)
 *     description: 更新特定系统配置项的值。只允许更新 `isEditable=true` 的配置项。需要 'system:configurations:update' 权限。
 *     tags: [System API - Configurations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: configKey {description: "配置项的键名。"}
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SingleSystemConfigUpdatePayload' }
 *     responses:
 *       200: { description: "系统配置项已成功更新。" }
 *       400: { description: "无效请求或值类型不匹配。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问或尝试更新不可编辑的配置项。" }
 *       404: { description: "未找到指定的配置项。" }
 * components:
 *   schemas:
 *     SingleSystemConfigUpdatePayload:
 *       type: object
 *       required: [value]
 *       properties:
 *         value: { type: "object", description: "配置项的新值。类型应与配置项定义匹配。" }
 */
async function updateSingleSystemConfigurationHandler(request: AuthenticatedRequest, context: RouteContext) {
  const { configKey } = context.params;

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = SingleSystemConfigUpdatePayloadSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const { value } = validationResult.data;

  try {
    const configItem = await prisma.systemConfiguration.findUnique({
      where: { key: configKey },
    });

    if (!configItem) {
      return NextResponse.json({ message: `Configuration item with key '${configKey}' not found.` }, { status: 404 });
    }
    if (!configItem.isEditable) {
      return NextResponse.json({ message: `Configuration item '${configKey}' is not editable.` }, { status: 403 });
    }

    let valueToStore: string;
    // Validate and stringify value based on stored type
    if (configItem.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Invalid type for boolean config '${configKey}'. Expected boolean.`);
      valueToStore = String(value);
    } else if (configItem.type === 'number') {
      if (typeof value !== 'number') throw new Error(`Invalid type for number config '${configKey}'. Expected number.`);
      valueToStore = String(value);
    } else if (configItem.type === 'json') {
      if (typeof value !== 'object' && !Array.isArray(value)) throw new Error(`Invalid type for json config '${configKey}'. Expected object or array.`);
      valueToStore = JSON.stringify(value);
    } else { // string or other
      if (typeof value !== 'string') throw new Error(`Invalid type for string config '${configKey}'. Expected string.`);
      valueToStore = value;
    }

    const updatedItem = await prisma.systemConfiguration.update({
      where: { key: configKey },
      data: { value: valueToStore, updatedAt: new Date() },
    });
    return NextResponse.json(formatConfigForResponse(updatedItem));

  } catch (error: any) {
    console.error(`Error updating system configuration '${configKey}':`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ message: `Configuration item with key '${configKey}' not found (P2025).` }, { status: 404 });
    }
    if (error.message.startsWith("Invalid type for")) { // Catch custom type validation errors
        return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: `Error updating configuration for key '${configKey}'.` }, { status: 500 });
  }
}
export const PUT = requirePermission('system:configurations:update')(updateSingleSystemConfigurationHandler);
