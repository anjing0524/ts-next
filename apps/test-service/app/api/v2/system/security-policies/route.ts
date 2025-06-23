// /api/v2/system/security-policies
// 描述: 管理系统安全策略 - 获取列表。
// (Manages system security policies - List.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { Prisma, PolicyType } from '@prisma/client';

// Zod Schema for listing security policies (query parameters)
// 列出安全策略的Zod Schema (查询参数)
const SecurityPolicyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.nativeEnum(PolicyType).optional(),
  isActive: z.preprocess(val => val === 'true' || val === true ? true : (val === 'false' || val === false ? false : undefined),
    z.boolean().optional()
  ),
});

/**
 * @swagger
 * /api/v2/system/security-policies:
 *   get:
 *     summary: 获取所有安全策略 (系统安全策略管理)
 *     description: 检索系统中定义的所有安全策略及其当前配置。需要 'system:securitypolicies:read' 权限。
 *     tags: [System API - Security Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page {description: "页码"}
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit {description: "每页数量"}
 *         in: query
 *         schema: { type: integer, default: 50 }
 *       - name: type {description: "按策略类型筛选 (PASSWORD_STRENGTH, LOGIN_SECURITY, etc.)"}
 *         in: query
 *         schema: { $ref: '#/components/schemas/PolicyTypeEnum' } # Assuming PolicyTypeEnum is defined globally for Swagger
 *       - name: isActive {description: "按策略是否激活筛选"}
 *         in: query
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: "成功获取安全策略列表。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 * components:
 *   schemas:
 *     PolicyTypeEnum: # Define this if not already globally available for Swagger
 *       type: string
 *       enum: [PASSWORD_STRENGTH, PASSWORD_HISTORY, PASSWORD_EXPIRATION, LOGIN_SECURITY, ACCESS_CONTROL, CLIENT_SECURITY, SCOPE_SECURITY]
 */
async function listSecurityPoliciesHandler(request: AuthenticatedRequest) {
  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => { queryParams[key] = value; });

  const validationResult = SecurityPolicyListQuerySchema.safeParse(queryParams);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }
  const { page, limit, type, isActive } = validationResult.data;

  const whereClause: Prisma.SecurityPolicyWhereInput = {};
  if (type) whereClause.type = type;
  if (isActive !== undefined) whereClause.isActive = isActive;

  try {
    const policies = await prisma.securityPolicy.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }, // Or type, then name
      skip: (page - 1) * limit,
      take: limit,
    });
    const totalRecords = await prisma.securityPolicy.count({ where: whereClause });

    // Prisma automatically parses JSON fields, so `policy.policy` will be an object.
    return NextResponse.json({
      data: policies, // The `policy` field is already an object/json by Prisma
      pagination: {
        page,
        pageSize: limit,
        totalItems: totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list security policies:", error);
    return NextResponse.json({ message: "Error listing security policies." }, { status: 500 });
  }
}
export const GET = requirePermission('system:securitypolicies:read')(listSecurityPoliciesHandler);

// POST for creating new policies is usually not a generic endpoint.
// Policies are often seeded or managed via specific update (PUT/PATCH) endpoints for each type.
// If a generic POST were needed, it would require a more complex Zod schema with discriminated unions for 'policy' based on 'type'.
