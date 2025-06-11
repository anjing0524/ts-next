import { NextRequest, NextResponse } from 'next/server';

import * as bcrypt from 'bcrypt';
import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Remove direct crypto import for password generation, use new util
// import crypto from 'crypto';
import { generateSecurePassword, SALT_ROUNDS } from '@/lib/auth/passwordUtils';
import { prisma } from '@/lib/prisma';

// Validation schemas
const CreateUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens and underscores'),
  email: z.string().email(),
  // Password will be generated, not taken from input
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  // Note: role field not supported in current schema
});

const UpdateUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  // Note: role field not supported in current schema
});

// GET /api/users - List users (admin only)
async function handleGetUsers(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));
  const search = searchParams.get('search') || '';
  const roleId = searchParams.get('roleId') || ''; // Changed from 'role' to 'roleId'
  const active = searchParams.get('active');

  try {
    // Build filter conditions
    const where: any = {};
    
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (roleId) {
      where.userRoles = {
        some: {
          roleId: roleId,
        },
      };
    }
    
    if (active !== null) {
      where.isActive = active === 'true';
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    // Log access
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'users_list',
      resource: 'users',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        page,
        limit,
        total,
        search: search || undefined,
        roleId: roleId || undefined, // Updated metadata key
        active: active || undefined,
      },
    });

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('Error listing users:', error);
    
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'users_list_error',
      resource: 'users',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create user (admin only)
async function handleCreateUser(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validatedData = CreateUserSchema.parse(body);

    // Check if user with username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: validatedData.username },
          { email: validatedData.email },
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { 
          error: 'User already exists',
          details: existingUser.username === validatedData.username 
            ? 'Username already taken' 
            : 'Email already registered'
        },
        { status: 409 }
      );
    }

    // Generate a secure random password using the new utility
    const generatedPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: validatedData.username,
        email: validatedData.email,
        passwordHash: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        isActive: true,
        // emailVerified: false, // Assuming default is false or handled elsewhere
        mustChangePassword: true, // New field
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        // emailVerified: true, // Assuming default is false or handled elsewhere
        mustChangePassword: true, // Include new field in selection
        createdAt: true,
      },
    });

    // Add initial password to history
    if (user) {
      await prisma.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: hashedPassword,
        },
      });
    }

    // Log creation
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'user_created',
      resource: 'users',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        createdUserId: user.id,
        username: user.username,
        email: user.email,
      },
    });

    // Return the created user AND the generated password for the admin
    return NextResponse.json({ ...user, initialPassword: generatedPassword }, { status: 201 });

  } catch (error) {
    console.error('Error creating user:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation error',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'user_creation_error',
      resource: 'users',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Apply OAuth 2.0 authentication with admin-level permissions
export const GET = withAuth(handleGetUsers, {
  requiredScopes: ['users:read', 'admin'],
  requiredPermissions: ['users:list'],
  requireUserContext: true,
});

export const POST = withAuth(handleCreateUser, {
  requiredScopes: ['users:write', 'admin'],
  requiredPermissions: ['users:create'],
  requireUserContext: true,
}); 