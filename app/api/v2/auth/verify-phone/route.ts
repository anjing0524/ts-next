// 文件路径: app/api/v2/auth/verify-phone/route.ts
// 描述: 手机验证确认端点 (Phone verification confirmation endpoint using OTP)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { User, PhoneVerificationRequest, Prisma } from '@prisma/client';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification

// 辅助函数：错误响应 (Helper function: Error response)
function errorResponse(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ error: errorCode || 'phone_verification_failed', message }, { status });
}

export async function POST(req: NextRequest) {
  // 1. 用户认证 (User Authentication via V2 Auth session token)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized: Missing or invalid Authorization header.', 401, 'unauthorized');
  }
  const sessionToken = authHeader.substring(7);
  if (!sessionToken) {
    return errorResponse('Unauthorized: Missing session token.', 401, 'unauthorized');
  }

  const { valid: sessionValid, payload: sessionPayload, error: sessionTokenError } = await JWTUtils.verifyV2AuthAccessToken(sessionToken);
  if (!sessionValid || !sessionPayload) {
    return errorResponse(`Unauthorized: Invalid or expired session token. ${sessionTokenError || ''}`.trim(), 401, 'invalid_token');
  }
  const userId = sessionPayload.userId as string | undefined;
  if (!userId) {
    return errorResponse('Unauthorized: Invalid session token payload (User ID missing).', 401, 'invalid_token_payload');
  }

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const { token: otp, phone: requestPhone } = requestBody; // 'token' from body is the OTP

  if (!otp || typeof otp !== 'string') {
    return errorResponse('Verification code (OTP) is required.', 400, 'validation_error_otp');
  }
  // 'phone' in body is optional; primary phone is taken from authenticated user record.
  // If 'phone' is provided, it could be used for an additional check, but not strictly necessary if OTP is tied to user.

  try {
    // 3. 获取用户信息 (Fetch user information)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Should not happen if session token is valid and refers to an existing user
      return errorResponse('Unauthorized: User not found.', 401, 'user_not_found');
    }
    if (!user.isActive) {
      return errorResponse('Forbidden: User account is inactive.', 403, 'account_inactive');
    }
    if (!user.phone) {
      // 用户必须有一个电话号码才能验证它 (User must have a phone number to verify it)
      return errorResponse('No phone number is associated with your account to verify.', 400, 'no_phone_on_account');
    }

    // 4. 验证OTP (Validate OTP)
    // 查找与用户ID、用户当前电话号码和提供的OTP匹配的最新、未使用、未过期的请求
    // (Find the latest, unused, unexpired request matching userId, user's current phone, and provided OTP)
    const verificationRequest = await prisma.phoneVerificationRequest.findFirst({
      where: {
        userId: userId,
        phone: user.phone, // 验证用户当前设置的电话号码 (Verify against user's currently set phone number)
        token: otp,      // 提供的OTP (The provided OTP)
        isUsed: false,
        expiresAt: { gt: new Date() }, // 检查是否过期 (Check if not expired)
      },
      orderBy: { createdAt: 'desc' }, // 获取最新的一个 (Get the latest one)
    });

    if (!verificationRequest) {
      // OTP不匹配、已使用、已过期或不适用于此用户/电话号码 (OTP mismatch, used, expired, or not for this user/phone)
      return errorResponse('Invalid or expired verification code (OTP). Please request a new one.', 400, 'invalid_or_expired_otp');
    }

    // 可选：如果请求中也提供了电话号码，再次确认它与用户的电话号码一致
    // (Optional: if phone was also provided in request, double check it matches user's phone)
    if (requestPhone && requestPhone !== user.phone) {
        console.warn(`Phone verification OTP for user ${userId} was valid, but requestPhone '${requestPhone}' mismatches user.phone '${user.phone}'.`);
        // 根据策略决定是否拒绝 (Decide whether to reject based on policy)
        // return errorResponse('Phone number in request does not match user\'s current phone number.', 400, 'phone_mismatch');
    }


    // 5. 更新用户手机验证状态和OTP请求状态 (Update user's phone verification status and OTP request status)
    await prisma.$transaction(async (tx) => {
      // a. 更新用户的 phoneVerified 状态 (Update user's phoneVerified status)
      await tx.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          updatedAt: new Date(), // 手动更新时间戳 (Manually update timestamp)
        },
      });

      // b. 将验证请求标记为已使用 (Mark verification request as used)
      await tx.phoneVerificationRequest.update({
        where: { id: verificationRequest.id },
        data: { isUsed: true },
      });
    });

    // 6. 返回成功响应 (Return success response)
    return NextResponse.json({ message: 'Phone number verified successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`Phone verification error for user ${userId}, OTP ${otp}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`Prisma error during phone verification for user ${userId}:`, error.code, error.meta);
    }
    return errorResponse('An unexpected error occurred during phone verification.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 在 lib/auth/oauth2.ts 中声明或实现
// (Ensure JWTUtils.verifyV2AuthAccessToken is declared or implemented in lib/auth/oauth2.ts)
/*
declare module '@/lib/auth/oauth2' {
  export class JWTUtils {
    static async verifyV2AuthAccessToken(token: string): Promise<{
      valid: boolean;
      payload?: { userId: string; [key: string]: any };
      error?: string;
    }>;
    // ... other methods
  }
}
*/
