import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { AuthorizationUtils, RateLimitUtils } from '@/lib/auth/oauth2';
import { withCORS } from '@/lib/auth/middleware';
import crypto from 'crypto';
import { z } from 'zod';

// Validation schema for registration
const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters'),
});

async function handleRegister(request: NextRequest): Promise<NextResponse> {
  // Rate limiting for registration attempts
  const rateLimitKey = RateLimitUtils.getRateLimitKey(request, 'ip');
  if (RateLimitUtils.isRateLimited(rateLimitKey, 5, 60000)) { // 5 attempts per minute
    return NextResponse.json(
      { 
        error: 'rate_limit_exceeded',
        error_description: 'Too many registration attempts. Please try again later.' 
      },
      { status: 429 }
    );
  }

  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    
    // Validate input
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Validation failed',
          validation_errors: validation.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const { username, email, password, firstName, lastName } = validation.data;

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      await AuthorizationUtils.logAuditEvent({
        action: 'registration_failed',
        resource: 'auth/register',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Username already exists: ${username}`,
      });

      return NextResponse.json(
        { 
          error: 'username_taken',
          error_description: 'Username is already taken' 
        },
        { status: 409 }
      );
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      await AuthorizationUtils.logAuditEvent({
        action: 'registration_failed',
        resource: 'auth/register',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: `Email already exists: ${email}`,
      });

      return NextResponse.json(
        { 
          error: 'email_taken',
          error_description: 'Email is already registered' 
        },
        { status: 409 }
      );
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        emailVerificationToken,
        emailVerified: false, // Require email verification
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    // Log successful registration
    await AuthorizationUtils.logAuditEvent({
      userId: user.id,
      action: 'user_registered',
      resource: 'auth/register',
      ipAddress,
      userAgent,
      success: true,
      metadata: {
        username: user.username,
        email: user.email,
      },
    });

    // TODO: Send email verification email
    // In a production system, you would send an email here with the verification token
    // Example: await sendVerificationEmail(user.email, emailVerificationToken);

    return NextResponse.json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    }, { status: 201 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await AuthorizationUtils.logAuditEvent({
      action: 'registration_error',
      resource: 'auth/register',
      ipAddress,
      userAgent,
      success: false,
      errorMessage,
    });

    console.error('Error during registration:', error);
    
    // Handle database constraint violations
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (target?.includes('username')) {
        return NextResponse.json(
          { 
            error: 'username_taken',
            error_description: 'Username is already taken' 
          },
          { status: 409 }
        );
      }
      if (target?.includes('email')) {
        return NextResponse.json(
          { 
            error: 'email_taken',
            error_description: 'Email is already registered' 
          },
          { status: 409 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

export const POST = withCORS(handleRegister); 