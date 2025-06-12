// 文件路径: app/api/v2/auth/register/route.ts
// 描述: 新用户注册API端点 (v2)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs'; // 使用 bcryptjs 进行密码哈希

import { prisma, Prisma } from '@/lib/prisma'; // Import Prisma for PrismaClientKnownRequestError
import { successResponse, errorResponse }from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // 用于审计

// --- 请求 Schema ---
const RegisterRequestSchema = z.object({
  username: z.string().min(3, '用户名 (username) 至少需要3个字符').max(50, '用户名不能超过50个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  email: z.string().email('无效的电子邮件地址 (Invalid email address)'),
  password: z.string().min(8, '密码 (password) 至少需要8个字符')
    // .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    //   '密码必须包含大小写字母、数字和特殊字符'), // 可根据密码策略调整
    ,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

/**
 * @swagger
 * /api/v2/auth/register:
 *   post:
 *     summary: 新用户注册 (New User Registration)
 *     description: 创建一个新用户账户。
 *     tags:
 *       - Auth V2
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名 (必须唯一)。
 *                 example: 'newuser'
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 用户的电子邮件地址 (必须唯一)。
 *                 example: 'newuser@example.com'
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 用户的密码 (至少8位字符)。
 *                 example: 'ValidP@ss123'
 *               firstName:
 *                 type: string
 *                 description: 用户名字 (可选)。
 *                 example: 'John'
 *               lastName:
 *                 type: string
 *                 description: 用户姓氏 (可选)。
 *                 example: 'Doe'
 *     produces:
 *       - application/json
 *     responses:
 *       '201':
 *         description: 用户注册成功。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: 新创建用户的ID。
 *                 username:
 *                   type: string
 *                 email:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       '400':
 *         description: 无效的请求 (例如，数据格式错误，密码太短)。
 *       '409':
 *         description: 冲突 (例如，用户名或电子邮件已存在)。
 *       '500':
 *         description: 服务器内部错误。
 */
async function registerHandler(request: NextRequest) {
  const overallRequestId = (request as any).requestId; // from withErrorHandler
  const body = await request.json();

  const validationResult = RegisterRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten().fieldErrors;
    return NextResponse.json(
      errorResponse(400, `无效的请求体: ${JSON.stringify(errorMessages)}`, 'VALIDATION_ERROR', overallRequestId),
      { status: 400 }
    );
  }

  const { username, email, password, firstName, lastName } = validationResult.data;

  // 1. 检查用户名或邮箱是否已存在
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: email },
      ],
    },
  });

  if (existingUser) {
    let conflictField = '';
    if (existingUser.username === username) {
      conflictField = '用户名 (username)';
    } else if (existingUser.email === email) {
      conflictField = '电子邮件 (email)';
    }
    await AuthorizationUtils.logAuditEvent({
        action: 'register_failed_conflict',
        actorId: username, // 尝试注册的用户名
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: `${conflictField} 已存在 (already exists)`,
        metadata: { username, email }
    });
    return NextResponse.json(
      errorResponse(409, `${conflictField} 已存在 (${conflictField} already exists)`, 'CONFLICT_ERROR', overallRequestId),
      { status: 409 }
    );
  }

  // 2. 哈希密码
  const saltRounds = 10; // bcryptjs 推荐 salt rounds
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // 3. 创建用户
  try {
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        isActive: true, // 新用户默认激活，或根据业务逻辑设置为 false 并发送验证邮件
        mustChangePassword: true, // 新用户首次登录强制修改密码
        // emailVerified: false, // 如果需要邮件验证流程
      },
    });

    // 审计注册成功事件
    await AuthorizationUtils.logAuditEvent({
        userId: newUser.id,
        action: 'user_register_success',
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: true,
        metadata: { username: newUser.username, email: newUser.email }
    });

    // 4. 返回新创建的用户信息 (不包括密码哈希)
    return NextResponse.json(
      successResponse(
        {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          createdAt: newUser.createdAt.toISOString(),
        },
        201, // HTTP 201 Created
        '用户注册成功 (User registered successfully)',
        overallRequestId
      ),
      { status: 201 }
    );

  } catch (error) {
    console.error('用户注册时发生错误 (Error during user registration):', error);
    // 审计注册失败事件 (通用错误)
    await AuthorizationUtils.logAuditEvent({
        action: 'register_failed_server_error',
        actorId: username,
        ipAddress: request.ip,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown server error',
        metadata: { username, email }
    });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // 理论上上面的检查已经覆盖了，但这是一个更具体的 Prisma 唯一约束错误
        return NextResponse.json(
          errorResponse(409, '用户名或电子邮件已存在 (Username or email already exists - DB constraint)', 'CONFLICT_ERROR', overallRequestId),
          { status: 409 }
        );
    }
    throw error; // 交给 withErrorHandler 处理
  }
}

export const POST = withErrorHandler(registerHandler);

EOF
