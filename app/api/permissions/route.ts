// app/api/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/middleware';

// GET /api/permissions - List all permissions
export const GET = withAuth(
  async (request: NextRequest, context) => {
    const { searchParams } = new URL(request.url);
    const resourceName = searchParams.get('resource');
    const userId = searchParams.get('userId');

    try {
      if (userId) {
        // Get permissions for a specific user
        const userPermissions = await prisma.userResourcePermission.findMany({
          where: {
            userId,
            isActive: true,
            ...(resourceName && {
              resource: {
                name: resourceName,
                isActive: true,
              },
            }),
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
          include: {
            resource: true,
            permission: true,
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        });

        return NextResponse.json({ permissions: userPermissions });
      } else {
        // Get all permissions in the system
        const permissions = await prisma.permission.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        });

        const resources = await prisma.resource.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        });

        return NextResponse.json({ permissions, resources });
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['permissions:read'],
    requireUserContext: true,
  }
);

// POST /api/permissions - Grant permission to user
export const POST = withAuth(
  async (request: NextRequest, context) => {
    try {
      const body = await request.json();
      const { userId, resourceName, permissionName, expiresAt } = body;

      if (!userId || !resourceName || !permissionName) {
        return NextResponse.json(
          { error: 'userId, resourceName, and permissionName are required' },
          { status: 400 }
        );
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId, isActive: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      // Check if resource exists
      const resource = await prisma.resource.findUnique({
        where: { name: resourceName, isActive: true },
      });

      if (!resource) {
        return NextResponse.json(
          { error: 'Resource not found' },
          { status: 404 }
        );
      }

      // Check if permission exists
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName, isActive: true },
      });

      if (!permission) {
        return NextResponse.json(
          { error: 'Permission not found' },
          { status: 404 }
        );
      }

      // Check if permission already exists
      const existingPermission = await prisma.userResourcePermission.findUnique({
        where: {
          userId_resourceId_permissionId: {
            userId,
            resourceId: resource.id,
            permissionId: permission.id,
          },
        },
      });

      if (existingPermission) {
        if (existingPermission.isActive && 
            (!existingPermission.expiresAt || existingPermission.expiresAt > new Date())) {
          return NextResponse.json(
            { error: 'Permission already granted' },
            { status: 409 }
          );
        }

        // Reactivate existing permission
        const updatedPermission = await prisma.userResourcePermission.update({
          where: { id: existingPermission.id },
          data: {
            isActive: true,
            grantedBy: context.user_id,
            grantedAt: new Date(),
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            updatedAt: new Date(),
          },
          include: {
            resource: true,
            permission: true,
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        });

        return NextResponse.json({ 
          message: 'Permission granted successfully',
          permission: updatedPermission 
        });
      }

      // Create new permission
      const newPermission = await prisma.userResourcePermission.create({
        data: {
          userId,
          resourceId: resource.id,
          permissionId: permission.id,
          grantedBy: context.user_id,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        include: {
          resource: true,
          permission: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      return NextResponse.json({ 
        message: 'Permission granted successfully',
        permission: newPermission 
      }, { status: 201 });
    } catch (error) {
      console.error('Error granting permission:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['permissions:write'],
    requireUserContext: true,
  }
);

// DELETE /api/permissions - Revoke permission from user
export const DELETE = withAuth(
  async (request: NextRequest, context) => {
    try {
      const { searchParams } = new URL(request.url);
      const userId = searchParams.get('userId');
      const resourceName = searchParams.get('resource');
      const permissionName = searchParams.get('permission');

      if (!userId || !resourceName || !permissionName) {
        return NextResponse.json(
          { error: 'userId, resource, and permission parameters are required' },
          { status: 400 }
        );
      }

      // Find the permission record
      const userPermission = await prisma.userResourcePermission.findFirst({
        where: {
          userId,
          resource: {
            name: resourceName,
            isActive: true,
          },
          permission: {
            name: permissionName,
            isActive: true,
          },
          isActive: true,
        },
      });

      if (!userPermission) {
        return NextResponse.json(
          { error: 'Permission not found or already revoked' },
          { status: 404 }
        );
      }

      // Revoke permission (soft delete)
      await prisma.userResourcePermission.update({
        where: { id: userPermission.id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({ 
        message: 'Permission revoked successfully' 
      });
    } catch (error) {
      console.error('Error revoking permission:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    requiredPermissions: ['permissions:delete'],
    requireUserContext: true,
  }
);
