// /api/v2/system/configurations
// 描述: 管理系统配置项 - 获取列表和批量更新。
// (Manages system configuration items - List and Bulk Update.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { Prisma, SystemConfiguration } from '@prisma/client';

// Zod Schema for listing system configurations (query parameters)
// 列出系统配置的Zod Schema (查询参数)
const SystemConfigListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100), // System configs usually aren't excessively numerous
  editableOnly: z.preprocess(val => val === 'true' || val === true, z.boolean().optional().default(false)),
});

// Zod Schema for a single entry in the bulk update payload
// 批量更新负载中单个条目的Zod Schema
const SystemConfigUpdateEntrySchema = z.object({
  key: z.string().min(1, "配置项的键不能为空 (Configuration key cannot be empty)"),
  value: z.any(), // Value can be string, number, boolean, or object/array for JSON type
});

// Zod Schema for the bulk update payload (array of entries)
// 批量更新负载的Zod Schema (条目数组)
const SystemConfigBulkUpdatePayloadSchema = z.array(SystemConfigUpdateEntrySchema);


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
function formatConfigForResponse(config: SystemConfiguration): any {
  return {
    ...config,
    value: parseConfigValue(config.value, config.type),
  };
}


/**
 * @swagger
 * /api/v2/system/configurations:
 *   get:
 *     summary: 获取所有系统配置项 (系统配置管理)
 *     description: 检索系统中所有可用的配置项及其当前值。需要 'system:configurations:read' 权限。
 *     tags: [System API - Configurations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page {description: "页码"}
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit {description: "每页数量"}
 *         in: query
 *         schema: { type: integer, default: 100 }
 *       - name: editableOnly {description: "只返回可编辑的配置项"}
 *         in: query
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: "成功获取系统配置项列表。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function listSystemConfigurationsHandler(request: AuthenticatedRequest) {
  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = SystemConfigListQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }
  const { page, limit, editableOnly } = validationResult.data;

  const whereClause: Prisma.SystemConfigurationWhereInput = {};
  if (editableOnly) {
    whereClause.isEditable = true;
  }

  try {
    const configurations = await prisma.systemConfiguration.findMany({
      where: whereClause,
      orderBy: { key: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const totalRecords = await prisma.systemConfiguration.count({ where: whereClause });

    return NextResponse.json({
      data: configurations.map(formatConfigForResponse),
      pagination: {
        page,
        pageSize: limit,
        totalItems: totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list system configurations:", error);
    return NextResponse.json({ message: "Error listing system configurations." }, { status: 500 });
  }
}
export const GET = requirePermission('system:configurations:read')(listSystemConfigurationsHandler);


/**
 * @swagger
 * /api/v2/system/configurations:
 *   put:
 *     summary: 批量更新系统配置项 (系统配置管理)
 *     description: 批量更新一个或多个系统配置项的值。只允许更新 `isEditable=true` 的配置项。需要 'system:configurations:update' 权限。
 *     tags: [System API - Configurations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items: { $ref: '#/components/schemas/SystemConfigUpdateEntry' }
 *     responses:
 *       200: { description: "系统配置项已成功更新。" }
 *       400: { description: "无效请求或部分更新失败。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问或尝试更新不可编辑的配置项。" }
 * components:
 *  schemas:
 *    SystemConfigUpdateEntry:
 *      type: object
 *      required: [key, value]
 *      properties:
 *        key: { type: string }
 *        value: { type: "object", description: "可以是字符串、数字、布尔值或JSON对象/数组" }
 */
async function bulkUpdateSystemConfigurationsHandler(request: AuthenticatedRequest) {
  let payloadArray;
  try {
    payloadArray = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = SystemConfigBulkUpdatePayloadSchema.safeParse(payloadArray);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const updates = validationResult.data;
  const results = [];
  const errors = [];

  for (const update of updates) {
    try {
      const configItem = await prisma.systemConfiguration.findUnique({
        where: { key: update.key },
      });

      if (!configItem) {
        errors.push({ key: update.key, message: "Configuration item not found." });
        continue;
      }
      if (!configItem.isEditable) {
        errors.push({ key: update.key, message: "Configuration item is not editable." });
        continue;
      }

      let valueToStore: string;
      // Validate and stringify value based on stored type
      if (configItem.type === 'boolean') {
        if (typeof update.value !== 'boolean') throw new Error('Invalid type for boolean config.');
        valueToStore = String(update.value);
      } else if (configItem.type === 'number') {
        if (typeof update.value !== 'number') throw new Error('Invalid type for number config.');
        valueToStore = String(update.value);
      } else if (configItem.type === 'json') {
        // For JSON, expect object/array, then stringify.
        if (typeof update.value !== 'object' && !Array.isArray(update.value)) throw new Error('Invalid type for json config, must be object or array.');
        valueToStore = JSON.stringify(update.value);
      } else { // string or other
        if (typeof update.value !== 'string') throw new Error('Invalid type for string config.');
        valueToStore = update.value;
      }

      const updatedItem = await prisma.systemConfiguration.update({
        where: { key: update.key },
        data: { value: valueToStore, updatedAt: new Date() },
      });
      results.push(formatConfigForResponse(updatedItem));
    } catch (err: any) {
      console.error(`Failed to update config key ${update.key}:`, err);
      errors.push({ key: update.key, message: err.message || "Update failed." });
    }
  }

  if (errors.length > 0) {
    // If there are any errors, even if some updates succeeded,
    // consider returning a mixed status or a general error indicating partial success.
    // For simplicity, if any error occurs, return 400 with details.
    return NextResponse.json({
      message: "One or more configuration updates failed.",
      updatedItems: results,
      failedItems: errors,
    }, { status: errors.length === updates.length ? 400 : 207 }); // 207 Multi-Status if partial success
  }

  return NextResponse.json({ data: results, message: "Configurations updated successfully." });
}
export const PUT = requirePermission('system:configurations:update')(bulkUpdateSystemConfigurationsHandler);
