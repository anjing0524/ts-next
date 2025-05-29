import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, hasResourcePermission } from '@/lib/auth/middleware';

// GET /api/users/{userId} - Get user profile
export const GET = withAuth(
  async (request: NextRequest, context) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Check if user can access this profile
    // User can access their own profile or must have admin permissions
    if (context.user_id !== userId) {
      if (!context.permissions.includes('user_profile:read_any')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to access this user profile' },
          { status: 403 }
        );
      }
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ user });
    } catch (error) {
      console.error('Error fetching user:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredScopes: ['profile'],
    requireUserContext: true,
  }
);

// PUT /api/users/{userId} - Update user profile
export const PUT = withAuth(
  async (request: NextRequest, context) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Check if user can update this profile
    if (context.user_id !== userId) {
      if (!context.permissions.includes('user_profile:write_any')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to update this user profile' },
          { status: 403 }
        );
      }
    }

    try {
      const body = await request.json();
      const { firstName, lastName, email } = body;

      // Validate input
      if (!firstName || !lastName) {
        return NextResponse.json(
          { error: 'firstName and lastName are required' },
          { status: 400 }
        );
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          email,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          isActive: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ user: updatedUser });
    } catch (error) {
      console.error('Error updating user:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredScopes: ['profile:write'],
    requireUserContext: true,
  }
);

// DELETE /api/users/{userId} - Delete user (admin only)
export const DELETE = withAuth(
  async (request: NextRequest, context) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    try {
      // Soft delete - just mark as inactive
      const deletedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          username: true,
          isActive: true,
        },
      });

      return NextResponse.json({ 
        message: 'User deactivated successfully',
        user: deletedUser 
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['user_profile:delete'],
    requireUserContext: true,
  }
); 