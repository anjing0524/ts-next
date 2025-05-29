import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { AuthorizationUtils, RateLimitUtils, OAuth2ErrorTypes } from '@/lib/auth/oauth2';
import { withCORS } from '@/lib/auth/middleware';
import crypto from 'crypto';
import { addHours } from 'date-fns';

async function handleLogin(request: NextRequest): Promise<NextResponse> {
  // Rate limiting for login attempts
  const rateLimitKey = RateLimitUtils.getRateLimitKey(request, 'ip');
  if (RateLimitUtils.isRateLimited(rateLimitKey, 10, 60000)) { // 10 attempts per minute
    return NextResponse.json(
      { 
        error: 'rate_limit_exceeded',
        error_description: 'Too many login attempts. Please try again later.' 
      },
      { status: 429 }
    );
  }

  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
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
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { email: username },
        ],
        isActive: true,
      },
    });

    if (!user) {
      await AuthorizationUtils.logAuditEvent({
        action: 'login_failed',
        resource: 'auth/login',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `User not found: ${username}`,
      });

      return NextResponse.json(
        { 
          error: 'invalid_credentials',
          error_description: 'Invalid username or password' 
        },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      await AuthorizationUtils.logAuditEvent({
        userId: user.id,
        action: 'login_failed',
        resource: 'auth/login',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Invalid password',
      });

      return NextResponse.json(
        { 
          error: 'invalid_credentials',
          error_description: 'Invalid username or password' 
        },
        { status: 401 }
      );
    }

    // Create user session
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = addHours(new Date(), 24); // 24 hour session

    await prisma.userSession.create({
      data: {
        userId: user.id,
        sessionId,
        ipAddress,
        userAgent,
        expiresAt: sessionExpiresAt,
      },
    });

    // Update user last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log successful login
    await AuthorizationUtils.logAuditEvent({
      userId: user.id,
      action: 'login_successful',
      resource: 'auth/login',
      ipAddress,
      userAgent,
      success: true,
    });

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      action: 'login_error',
      resource: 'auth/login',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during login:', error);
    
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

export const POST = withCORS(handleLogin);
