import { NextRequest, NextResponse } from 'next/server';

import * as bcrypt from 'bcrypt';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { generateSecurePassword, SALT_ROUNDS } from '@/lib/auth/passwordUtils';
import { prisma } from '@/lib/prisma';


interface RouteParams {
  params: {
    userId: string;
  }
}

// POST /api/admin/users/{userId}/reset-password
async function handleAdminResetPassword(request: NextRequest, authContext: AuthContext, routeParams: RouteParams) {
  const { userId: targetUserId } = routeParams.params;
  const adminUserId = authContext.user_id; // User performing the action
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    // Validate that the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      await AuthorizationUtils.logAuditEvent({
        userId: adminUserId,
        action: 'admin_password_reset_user_not_found',
        resource: `admin/users/${targetUserId}/reset-password`,
        ipAddress, userAgent, success: false,
        errorMessage: 'Target user for password reset not found.',
        metadata: { targetUserId }
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate new temporary password
    const newTemporaryPassword = generateSecurePassword();
    const hashedNewPassword = await bcrypt.hash(newTemporaryPassword, SALT_ROUNDS);

    // Update User Record
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash: hashedNewPassword,
        mustChangePassword: true,
        lockedUntil: null, // Clear account lock
        failedLoginAttempts: 0, // Reset failed login attempts
      },
    });

    // Add new password to history
    // It's generally fine to just create; conflicts are astronomically unlikely for secure random passwords.
    await prisma.passwordHistory.create({
      data: {
        userId: targetUserId,
        passwordHash: hashedNewPassword,
        // createdAt is default now()
      },
    });

    // Audit Logging
    await AuthorizationUtils.logAuditEvent({
      userId: adminUserId,
      action: 'admin_password_reset_success',
      resource: `admin/users/${targetUserId}/reset-password`,
      ipAddress, userAgent, success: true,
      metadata: { targetUserId, adminUserId },
    });

    // Response
    return NextResponse.json({ newTemporaryPassword: newTemporaryPassword });

  } catch (error) {
    console.error(`Error during admin password reset for user ${targetUserId}:`, error);
    await AuthorizationUtils.logAuditEvent({
      userId: adminUserId,
      action: 'admin_password_reset_error',
      resource: `admin/users/${targetUserId}/reset-password`,
      ipAddress, userAgent, success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown server error.',
      metadata: { targetUserId },
    });
    return NextResponse.json({ error: 'Failed to reset user password due to a server error.' }, { status: 500 });
  }
}

export const POST = withAuth(handleAdminResetPassword, {
  requiredPermissions: ['users:reset_password', 'admin'], // Requires either specific or general admin permission
  requireUserContext: true,
});
