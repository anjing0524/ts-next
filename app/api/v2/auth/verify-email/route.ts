// 文件路径: app/api/v2/auth/verify-email/route.ts
// 描述: 邮箱验证确认端点 (Email verification confirmation endpoint)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, EmailVerificationRequest, Prisma } from '@prisma/client';

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'email_verification_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { token } = requestBody;

  if (!token || typeof token !== 'string') {
    return errorResponse('Verification token is required.', 400, 'validation_error');
  }

  try {
    // 1. 验证令牌 (Validate verification token)
    const verificationRequest = await prisma.emailVerificationRequest.findUnique({
      where: { token: token },
    });

    if (!verificationRequest) {
      return errorResponse('Invalid or expired verification token.', 400, 'invalid_or_expired_token');
    }
    if (verificationRequest.isUsed) {
      return errorResponse('This verification token has already been used.', 400, 'token_already_used');
    }
    if (verificationRequest.expiresAt < new Date()) {
      // 可选：如果令牌过期，也将其标记为已使用，以防止未来的尝试 (Optional: if token expired, also mark as used to prevent future attempts)
      // await prisma.emailVerificationRequest.update({ where: { id: verificationRequest.id }, data: { isUsed: true } });
      return errorResponse('Verification token has expired.', 400, 'token_expired');
    }

    // 2. 获取用户信息并检查 (Fetch user information and check)
    const user = await prisma.user.findUnique({
      where: { id: verificationRequest.userId },
    });

    if (!user) {
      // 如果与令牌关联的用户不存在 (If user associated with token does not exist)
      console.error(`User with ID ${verificationRequest.userId} not found for valid verification token ${token}. This should not happen.`);
      // 将令牌标记为已使用，因为它指向一个无效状态 (Mark token as used as it points to an invalid state)
      await prisma.emailVerificationRequest.update({ where: { id: verificationRequest.id }, data: { isUsed: true } });
      return errorResponse('Invalid token: Associated user not found.', 400, 'user_not_found_for_token');
    }

    // 3. 检查邮箱是否匹配 (Check if email matches)
    // 要求验证请求中的邮箱与用户当前的邮箱一致 (Require email in verification request to match user's current email)
    // 这是为了防止用户更改邮箱后，使用旧的验证链接来验证新邮箱，或验证一个不再属于他们的邮箱。
    // (This prevents using an old verification link for a new email if the user changed it, or verifying an email no longer theirs.)
    if (user.email.toLowerCase() !== verificationRequest.email.toLowerCase()) {
        console.warn(`Email verification attempt for user ${user.id} with token ${token}, but user's current email (${user.email}) does not match token's email (${verificationRequest.email}).`);
        // 根据策略，可以将此令牌视为无效或已滥用 (Depending on policy, this token could be considered invalid or abused)
        // await prisma.emailVerificationRequest.update({ where: { id: verificationRequest.id }, data: { isUsed: true } });
        return errorResponse('Invalid verification token: Email mismatch. Please request a new verification link if you recently updated your email.', 400, 'email_mismatch');
    }

    // 4. 更新用户邮箱验证状态和令牌状态 (Update user's email verification status and token status)
    // 使用 Prisma 事务确保原子性操作 (Use Prisma transaction for atomicity)
    await prisma.$transaction(async (tx) => {
      // a. 更新用户的 emailVerified 状态 (Update user's emailVerified status)
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          updatedAt: new Date(), // 手动更新时间戳 (Manually update timestamp)
        },
      });

      // b. 将验证请求标记为已使用 (Mark verification request as used)
      await tx.emailVerificationRequest.update({
        where: { id: verificationRequest.id },
        data: { isUsed: true },
      });
    });

    // 5. 返回成功响应 (Return success response)
    return NextResponse.json({ message: 'Email verified successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`Email verification error for token ${token}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`Prisma error during email verification for token ${token}:`, error.code, error.meta);
    }
    return errorResponse('An unexpected error occurred during email verification.', 500, 'server_error');
  }
}
