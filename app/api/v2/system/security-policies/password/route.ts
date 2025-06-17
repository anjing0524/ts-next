// /api/v2/system/security-policies/password
// 描述: 管理密码相关的安全策略 (获取和更新)。
// (Manages password-related security policies - Get and Update.)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { Prisma, PolicyType, SecurityPolicy } from '@prisma/client';

// --- Zod Schemas for Password Policies ---

// 密码强度策略的Zod Schema
const PasswordStrengthPolicySchema = z.object({
  minLength: z.number().int().min(6).max(128).default(8),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumber: z.boolean().default(true),
  requireSpecialChar: z.boolean().default(false), // Note: `requireSymbol` was in Swagger, using `requireSpecialChar` for consistency
  // minCharacterTypes: z.number().int().min(1).max(4).default(3), // Example from design doc, not in current swagger example here
});

// 密码历史策略的Zod Schema
const PasswordHistoryPolicySchema = z.object({
  historyCount: z.number().int().min(0).max(24).default(5), // 0 means disabled
});

// 密码过期策略的Zod Schema
const PasswordExpirationPolicySchema = z.object({
  maxAgeDays: z.number().int().min(0).max(365).default(90), // 0 means disabled
  notifyDaysBeforeExpiration: z.number().int().min(0).max(30).default(14),
});

// 更新密码策略的完整请求体Zod Schema
const UpdatePasswordPoliciesSchema = z.object({
  passwordStrength: PasswordStrengthPolicySchema.optional(),
  passwordHistory: PasswordHistoryPolicySchema.optional(),
  passwordExpiration: PasswordExpirationPolicySchema.optional(),
}).strict(); // No other properties allowed

// Helper to fetch and structure password policies
// 辅助函数：获取并构造密码策略对象
async function getPasswordPolicies(): Promise<Record<string, any>> {
  const policies = await prisma.securityPolicy.findMany({
    where: {
      type: {
        in: [PolicyType.PASSWORD_STRENGTH, PolicyType.PASSWORD_HISTORY, PolicyType.PASSWORD_EXPIRATION],
      },
      isActive: true, // Typically, only active policies are relevant
    },
  });

  const structuredPolicies: Record<string, any> = {};
  policies.forEach(p => {
    // Prisma automatically parses the JSON 'policy' field
    if (p.type === PolicyType.PASSWORD_STRENGTH) structuredPolicies.passwordStrength = p.policy;
    if (p.type === PolicyType.PASSWORD_HISTORY) structuredPolicies.passwordHistory = p.policy;
    if (p.type === PolicyType.PASSWORD_EXPIRATION) structuredPolicies.passwordExpiration = p.policy;
  });
  return structuredPolicies;
}

/**
 * @swagger
 * /api/v2/system/security-policies/password:
 *   get:
 *     summary: 获取密码相关安全策略 (系统安全策略管理)
 *     description: 检索与密码相关的安全策略，包括密码强度、历史、过期等。需要 'system:securitypolicies:read' 权限。
 *     tags: [System API - Security Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "成功获取密码相关安全策略。" } # Schema defined in previous subtask
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 */
async function getPasswordPoliciesHandler(request: AuthenticatedRequest) {
  try {
    const policies = await getPasswordPolicies();
    // Ensure all policy types have at least default values if not found in DB
    // This part depends on whether policies are guaranteed to exist or should be created on-the-fly if missing.
    // For now, assuming they are seeded or an admin UI manages their creation.
    // If a policy type is missing, its key will be absent in the response.
    return NextResponse.json(policies);
  } catch (error) {
    console.error("Error fetching password policies:", error);
    return NextResponse.json({ message: "Error fetching password policies." }, { status: 500 });
  }
}
export const GET = requirePermission('system:securitypolicies:read')(getPasswordPoliciesHandler);


/**
 * @swagger
 * /api/v2/system/security-policies/password:
 *   put:
 *     summary: 更新密码相关安全策略 (系统安全策略管理)
 *     description: 更新与密码相关的各项安全策略配置。需要 'system:passwordpolicy:update' 权限。
 *     tags: [System API - Security Policies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PasswordPoliciesUpdatePayload' }
 *     responses:
 *       200: { description: "密码相关安全策略已成功更新。" }
 *       400: { description: "无效请求参数。" }
 *       401: { description: "未经授权。" }
 *       403: { description: "禁止访问。" }
 * components:
 *   schemas:
 *     PasswordPoliciesUpdatePayload:
 *       type: object
 *       properties:
 *         passwordStrength: { $ref: '#/components/schemas/PasswordStrengthPolicy' }
 *         passwordHistory: { $ref: '#/components/schemas/PasswordHistoryPolicy' }
 *         passwordExpiration: { $ref: '#/components/schemas/PasswordExpirationPolicy' }
 *     PasswordStrengthPolicy: # Define this based on Zod schema
 *       type: object
 *       properties: { minLength: {type: "integer"}, requireUppercase: {type: "boolean"} /* etc. */ }
 *     PasswordHistoryPolicy: # Define this
 *       type: object
 *       properties: { historyCount: {type: "integer"} }
 *     PasswordExpirationPolicy: # Define this
 *       type: object
 *       properties: { maxAgeDays: {type: "integer"} /* etc. */ }
 */
async function updatePasswordPoliciesHandler(request: AuthenticatedRequest) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = UpdatePasswordPoliciesSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const { passwordStrength, passwordHistory, passwordExpiration } = validationResult.data;
  const updates: Promise<SecurityPolicy>[] = [];

  try {
    if (passwordStrength) {
      updates.push(prisma.securityPolicy.upsert({
        where: { type: PolicyType.PASSWORD_STRENGTH }, // Assuming type is unique for these global policies
        update: { policy: passwordStrength as Prisma.JsonObject, isActive: true, name: 'Password Strength Policy' },
        create: { name: 'Password Strength Policy', type: PolicyType.PASSWORD_STRENGTH, policy: passwordStrength as Prisma.JsonObject, isActive: true, description: "Defines requirements for user passwords." },
      }));
    }
    if (passwordHistory) {
      updates.push(prisma.securityPolicy.upsert({
        where: { type: PolicyType.PASSWORD_HISTORY },
        update: { policy: passwordHistory as Prisma.JsonObject, isActive: true, name: 'Password History Policy' },
        create: { name: 'Password History Policy', type: PolicyType.PASSWORD_HISTORY, policy: passwordHistory as Prisma.JsonObject, isActive: true, description: "Defines password reuse restrictions." },
      }));
    }
    if (passwordExpiration) {
      updates.push(prisma.securityPolicy.upsert({
        where: { type: PolicyType.PASSWORD_EXPIRATION },
        update: { policy: passwordExpiration as Prisma.JsonObject, isActive: true, name: 'Password Expiration Policy' },
        create: { name: 'Password Expiration Policy', type: PolicyType.PASSWORD_EXPIRATION, policy: passwordExpiration as Prisma.JsonObject, isActive: true, description: "Defines password validity duration." },
      }));
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "No password policies provided for update." }, { status: 400 });
    }

    await prisma.$transaction(updates);
    const updatedPolicies = await getPasswordPolicies(); // Fetch the updated, structured policies

    return NextResponse.json(updatedPolicies);
  } catch (error) {
    console.error("Error updating password policies:", error);
    return NextResponse.json({ message: "Error updating password policies." }, { status: 500 });
  }
}
export const PUT = requirePermission('system:passwordpolicy:update')(updatePasswordPoliciesHandler);
