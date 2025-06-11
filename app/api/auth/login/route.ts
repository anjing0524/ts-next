import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcrypt';
import { withAuthEndpoint, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
// crypto is not directly used for session ID anymore, createSession handles it.
// import crypto from 'crypto';
import { addMinutes, isFuture } from 'date-fns';
import { createSession } from '@/lib/auth/session'; // Import createSession

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_DURATION_MINUTES = 15;

async function handleLogin(request: NextRequest, authContext?: AuthContext): Promise<NextResponse> { // authContext might be passed by wrapper
  const ipAddress = request.headers.get('x-forwarded-for') || request.ip || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    const { username, password, returnUrl } = body;

    if (!username || !password) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Username and password are required' 
        },
        { status: 400 }
      );
    }

    // Find user by username or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { email: username },
        ],
        // isActive: true, // We fetch even inactive to check lock status first, then deny if inactive
      },
    });

    if (user && user.lockedUntil && isFuture(user.lockedUntil)) {
      await AuthorizationUtils.logAuditEvent({
        userId: user.id, // Log against the user being attempted
        action: 'login_attempt_on_locked_account',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Account locked until ${user.lockedUntil.toISOString()}`,
        metadata: { username },
      });
      return NextResponse.json(
        {
          error: 'account_locked',
          error_description: `Account is locked. Please try again after ${user.lockedUntil.toLocaleTimeString()}.`,
          lockedUntil: user.lockedUntil.toISOString(),
        },
        { status: 403 }
      );
    }

    if (!user || !user.isActive) { // Now check if user doesn't exist or is inactive
      // Generic message for non-existent or inactive user to prevent username enumeration
      // Audit log for this specific case is likely handled by withAuthEndpoint's default failure log
      return NextResponse.json(
        { 
          error: 'invalid_credentials',
          error_description: 'Invalid username or password' 
        },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash); // Corrected to passwordHash

    if (!isValidPassword) {
      let failedAttempts = user.failedLoginAttempts + 1;
      let newLockedUntil = user.lockedUntil;
      let accountJustLocked = false;

      if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        newLockedUntil = addMinutes(new Date(), ACCOUNT_LOCKOUT_DURATION_MINUTES);
        failedAttempts = 0; // Reset attempts after locking
        accountJustLocked = true;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil: newLockedUntil,
        },
      });

      if (accountJustLocked) {
        await AuthorizationUtils.logAuditEvent({
          userId: user.id,
          action: 'account_locked_due_to_failures',
          ipAddress,
          userAgent,
          success: false, // Security event, not a successful operation for the user
          errorMessage: `Account locked after ${MAX_FAILED_LOGIN_ATTEMPTS} failed attempts. Locked until ${newLockedUntil?.toISOString()}`,
          metadata: { username },
        });
      }
      // The generic failed login audit is likely handled by withAuthEndpoint

      return NextResponse.json(
        { 
          error: 'invalid_credentials',
          error_description: 'Invalid username or password' 
        },
        { status: 401 }
      );
    }

    // On Successful Login:
    // Reset failed attempts and lockout status, update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null, // Clear any previous lock
        lastLoginAt: new Date(),
      },
    });

    // Create user session using the utility function
    // This will now use SESSION_INACTIVITY_DURATION_MS for expiresAt
    const sessionId = await createSession(user.id, ipAddress, userAgent);

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      returnUrl,
    });

    // Set secure session cookie
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;

  } catch (error: any) {
    console.error('Error during login:', error);
    // Generic error, specific audit for this can be added if withAuthEndpoint doesn't cover it well enough
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'An unexpected error occurred during login'
      },
      { status: 500 }
    );
  }
}

// Using withAuthEndpoint handles rate limiting and basic audit logging (success/failure).
// The 'user_login' action name passed here will be used in those generic audit logs.
export const POST = withAuthEndpoint(handleLogin, 'user_login');
