// 文件路径: app/api/v2/auth/password/forgot/route.ts
// 描述: 请求密码重置端点 (Request password reset endpoint)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import crypto from 'crypto'; // For generating a secure random token
import { addHours } from 'date-fns'; // For setting token expiry
import { isValidEmail } from '@repo/lib/utils'; // Assuming this utility exists

const RESET_TOKEN_LENGTH = 32; // 重置令牌的长度（字节数）(Length of the reset token in bytes)
const RESET_TOKEN_EXPIRY_HOURS = 1; // 重置令牌的有效期（小时）(Expiry duration of the reset token in hours)

// 辅助函数：通用成功响应 (Helper function: Generic success response)
// 为了防止用户枚举，无论邮箱是否存在或用户状态如何，都返回此响应
// (To prevent user enumeration, this response is returned regardless of email existence or user status)
function genericSuccessResponse() {
  return NextResponse.json({
    message: "If your email address exists in our system and is associated with an active account, you will receive a password reset link shortly."
  }, { status: 200 });
}

// 辅助函数：错误响应 (Helper function: Error response for server errors)
function serverErrorResponse(message: string = 'An unexpected error occurred.') {
  return NextResponse.json({ error: 'server_error', message }, { status: 500 });
}

export async function POST(req: NextRequest) {
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    // 虽然我们通常返回通用成功响应，但无效的JSON是一个客户端错误，可以明确指出
    // (Although we usually return a generic success response, invalid JSON is a client error that can be pointed out)
    return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON request body.' }, { status: 400 });
  }

  const { email } = requestBody;

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    // 同样，对于明显无效的输入，可以返回一个错误，或者选择返回通用成功响应
    // (Similarly, for clearly invalid input, can return an error or opt for generic success response)
    // 为了简单和安全，这里也返回通用成功响应，避免探测 (For simplicity and security, also return generic success here to avoid probing)
    console.warn(`Password reset attempt with invalid email format: ${email}`);
    return genericSuccessResponse();
  }

  try {
    // 1. 根据用户名查找用户 (Find user by username)
    const user = await prisma.user.findUnique({
      where: { username: email.trim().toLowerCase() },
    });

    // 2. 如果用户存在且激活 (If user exists and is active)
    // 注意：即使找不到用户或用户不活跃，我们仍然会在最后返回通用成功消息
    // (Note: Even if user is not found or inactive, we still return the generic success message at the end)
    if (user && user.isActive) {
      // 可选：检查用户是否被锁定 (Optional: Check if user is locked)
      // if (user.lockedUntil && user.lockedUntil > new Date()) {
      //   console.log(`Password reset attempt for locked account: ${email}`);
      //   return genericSuccessResponse(); // 依然返回通用响应 (Still return generic response)
      // }

      // 3. 生成唯一的、安全的、有时间限制的密码重置令牌
      // (Generate a unique, secure, time-limited password reset token)
      const resetToken = crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex');
      const expiresAt = addHours(new Date(), RESET_TOKEN_EXPIRY_HOURS);

      // 4. 将令牌（原值）存储到 PasswordResetRequest 表中
      // (Store the token (original value) in the PasswordResetRequest table)
      // 在存储新令牌之前，可以考虑让旧的、未使用的同一用户令牌失效
      // (Before storing a new token, consider invalidating old, unused tokens for the same user)
      await prisma.passwordResetRequest.updateMany({
        where: {
          userId: user.id,
          isUsed: false,
          expiresAt: { gt: new Date() } // 只将未过期且未使用的令牌标记为已使用（或删除）
                                       // (Only mark unused and unexpired tokens as used (or delete them))
        },
        data: {
          isUsed: true, // 将旧令牌标记为已用，或设置一个非常早的过期时间
                        // (Mark old tokens as used, or set a very early expiry)
          // expiresAt: new Date(0) // 另一种使其失效的方法 (Another way to invalidate)
        }
      });

      await prisma.passwordResetRequest.create({
        data: {
          userId: user.id,
          token: resetToken, // 存储原始令牌值 (Store the original token value)
          expiresAt: expiresAt,
          isUsed: false,
        },
      });

      // 5. 模拟邮件发送 (Simulate Email Sending)
      // 在实际应用中，这里会调用邮件服务发送包含重置链接的邮件
      // (In a real application, an email service would be called here to send an email with the reset link)
      const resetLink = `https://yourfrontend.com/reset-password?token=${resetToken}`; // 示例重置链接 (Example reset link)
      console.log(`---- SIMULATED EMAIL ----`);
      console.log(`To: ${user.username}`);
      console.log(`From: noreply@example.com`);
      console.log(`Subject: Password Reset Request`);
      console.log(`Body: Please reset your password using the following link: ${resetLink}`);
      console.log(`   This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).`);
      console.log(`   Password Reset Token (for testing/logging only, DO NOT include in real email body like this): ${resetToken}`);
      console.log(`---- END SIMULATED EMAIL ----`);
    } else {
      // 用户未找到或不活跃 (User not found or inactive)
      if (!user) {
        console.log(`Password reset attempt for non-existent email: ${email}`);
      } else if (!user.isActive) {
        console.log(`Password reset attempt for inactive account: ${email}`);
      }
    }

    // 6. 返回通用成功响应 (Return generic success response)
    return genericSuccessResponse();

  } catch (error: any) {
    console.error('Password forgot endpoint error:', error);
    // 即便发生服务器错误，为了安全，也可能选择返回通用成功消息
    // (Even in case of a server error, for security, one might choose to return the generic success message)
    // 但是，对于真正的服务器问题，记录错误并返回500可能更合适，以便调试
    // (However, for genuine server issues, logging the error and returning 500 might be more appropriate for debugging)
    // 此处我们选择区分：如果是Prisma错误，可能与数据库有关，返回500。
    // (Here we choose to differentiate: if it's a Prisma error, possibly DB related, return 500.)
    if (error.code && error.meta) { // Prisma error heuristic
        return serverErrorResponse('Failed to process password reset request due to a database error.');
    }
    return serverErrorResponse();
  }
}

// 确保 isValidEmail 在 lib/utils.ts 中声明或实现
// (Ensure isValidEmail is declared or implemented in lib/utils.ts)
/*
declare module '@/lib/utils' {
  export function isValidEmail(email: string): boolean;
}
*/
