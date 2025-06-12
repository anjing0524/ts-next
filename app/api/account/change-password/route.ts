import { NextRequest, NextResponse } from 'next/server';

import * as bcrypt from 'bcrypt';
import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For logging
import {
  PasswordComplexitySchema,
  checkPasswordHistory,
  SALT_ROUNDS,
} from '@/lib/auth/passwordUtils';
import { prisma } from '@/lib/prisma';

const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: PasswordComplexitySchema, // Use the complexity schema directly
});

const NUM_PASSWORDS_TO_CHECK_IN_HISTORY = 5; // Configurable: How many recent passwords to check

async function handleChangePassword(
  request: NextRequest,
  context: AuthContext
): Promise<NextResponse> {
  if (!context.user_id) {
    // This should ideally be caught by withAuth, but as a safeguard
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = ChangePasswordSchema.safeParse(body);

    if (!validation.success) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        action: 'account_change_password_validation_failed',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Input validation failed',
        metadata: { errors: validation.error.flatten().fieldErrors },
      });
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validation.data;

    const user = await prisma.user.findUnique({
      where: { id: context.user_id },
    });

    if (!user) {
      // Should not happen if context.user_id is valid
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id, // Log with the ID from token even if user not found in DB
        action: 'account_change_password_user_not_found',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'User not found during password change attempt.',
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // a. Verify currentPassword
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        action: 'account_change_password_current_invalid',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Current password verification failed.',
      });
      return NextResponse.json({ error: 'Invalid current password' }, { status: 401 });
    }

    // c. Password History Check
    const isPasswordNovel = await checkPasswordHistory(
      user.id,
      newPassword,
      NUM_PASSWORDS_TO_CHECK_IN_HISTORY
    );
    if (!isPasswordNovel) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        action: 'account_change_password_history_conflict',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'New password matches one of the recent passwords.',
      });
      return NextResponse.json(
        { error: 'New password cannot be the same as recent passwords' },
        { status: 400 }
      );
    }

    // d. If all checks pass:
    const newHashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHashedPassword,
          mustChangePassword: false, // Clear the flag
        },
      });

      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: newHashedPassword,
        },
      });
    });

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      action: 'account_change_password_success',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
    });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id, // Attempt to log with user_id if available
      action: 'account_change_password_error',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: errorMessage,
    });

    if (error instanceof z.ZodError) {
      // Should be caught by safeParse earlier, but as a fallback
      return NextResponse.json(
        { error: 'Validation error', details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error while changing password' },
      { status: 500 }
    );
  }
}

export const PUT = withAuth(handleChangePassword, {
  // Define required scopes/permissions if necessary, for now just authenticated user
  requireUserContext: true,
});
