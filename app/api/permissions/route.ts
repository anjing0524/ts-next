// app/api/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';
import logger from '@/utils/logger';

// Validation schemas
const GetPermissionsSchema = z.object({
  resource: z.string().optional(),
  userId: z.string().optional(),
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  includeExpired: z.string().optional().transform(val => val === 'true'),
});

const GrantPermissionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  resourceName: z.string().min(1, 'Resource name is required'),
  permissionName: z.string().min(1, 'Permission name is required'),
  expiresAt: z.string().datetime().optional(),
  // Note: reason and metadata are not supported in current schema
});

const RevokePermissionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  resource: z.string().min(1, 'Resource name is required'),
  permission: z.string().min(1, 'Permission name is required'),
  // Note: reason is not supported in current schema
});

// GET /api/permissions - List all permissions or user-specific permissions
async function handleGetPermissions(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const validatedParams = GetPermissionsSchema.parse(Object.fromEntries(searchParams.entries()));
    
    const { resource: resourceName, userId, limit, offset, includeExpired } = validatedParams;

    if (userId) {
      // Get permissions for a specific user
      const whereClause = {
        userId,
        ...(resourceName && {
          resource: {
            name: resourceName,
            isActive: true,
          },
        }),
        ...(includeExpired ? {} : {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        }),
      };

      const [userPermissions, totalCount] = await Promise.all([
        prisma.userResourcePermission.findMany({
          where: whereClause,
          include: {
            resource: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
              },
            },
            permission: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
              },
            },
          },
          orderBy: [
            { resource: { name: 'asc' } },
            { permission: { name: 'asc' } },
          ],
          take: limit,
          skip: offset,
        }),
        prisma.userResourcePermission.count({ where: whereClause }),
      ]);

      // Log access
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'permissions_listed_for_user',
        resource: 'permissions',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: true,
        metadata: {
          targetUserId: userId,
          resourceFilter: resourceName,
          includeExpired,
          resultCount: userPermissions.length,
        },
      });

      return NextResponse.json({
        permissions: userPermissions,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      });
    } else {
      // Get all permissions and resources in the system
      const [permissions, resources, totalPermissions, totalResources] = await Promise.all([
        prisma.permission.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          take: limit,
          skip: offset,
        }),
        prisma.resource.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          take: limit,
          skip: offset,
        }),
        prisma.permission.count({ where: { isActive: true } }),
        prisma.resource.count({ where: { isActive: true } }),
      ]);

      // Log access
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'permissions_system_listed',
        resource: 'permissions',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: true,
        metadata: {
          permissionsCount: permissions.length,
          resourcesCount: resources.length,
        },
      });

      return NextResponse.json({
        permissions,
        resources,
        pagination: {
          permissions: {
            total: totalPermissions,
            limit,
            offset,
            hasMore: offset + limit < totalPermissions,
          },
          resources: {
            total: totalResources,
            limit,
            offset,
            hasMore: offset + limit < totalResources,
          },
        },
      });
    }
  } catch (error) {
    console.error('Error fetching permissions:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'validation_error',
          error_description: 'Invalid request parameters',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'permissions_list_error',
      resource: 'permissions',
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

// POST /api/permissions - Grant permission to user
async function handleGrantPermission(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validatedData = GrantPermissionSchema.parse(body);
    
    const { userId, resourceName, permissionName, expiresAt } = validatedData;

    // Verify entities exist
    const [user, resource, permission] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId, isActive: true },
        select: { id: true, username: true, email: true, isActive: true },
      }),
      prisma.resource.findUnique({
        where: { name: resourceName, isActive: true },
        select: { id: true, name: true, description: true },
      }),
      prisma.permission.findUnique({
        where: { name: permissionName, isActive: true },
        select: { id: true, name: true, description: true },
      }),
    ]);

    if (!user) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'permission_grant_user_not_found',
        resource: 'permissions',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Target user not found',
        metadata: { targetUserId: userId },
      });

      return NextResponse.json(
        { 
          error: 'user_not_found',
          error_description: 'User not found or inactive',
        },
        { status: 404 }
      );
    }

    if (!resource) {
      return NextResponse.json(
        { 
          error: 'resource_not_found',
          error_description: 'Resource not found or inactive',
        },
        { status: 404 }
      );
    }

    if (!permission) {
      return NextResponse.json(
        { 
          error: 'permission_not_found',
          error_description: 'Permission not found or inactive',
        },
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
        await AuthorizationUtils.logAuditEvent({
          userId: context.user_id,
          clientId: context.client_id,
          action: 'permission_grant_duplicate',
          resource: 'permissions',
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
          success: false,
          errorMessage: 'Permission already granted',
          metadata: {
            targetUserId: userId,
            resourceName,
            permissionName,
            existingPermissionId: existingPermission.id,
          },
        });

        return NextResponse.json(
          { 
            error: 'permission_already_granted',
            error_description: 'Permission is already granted and active',
          },
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

      // Log successful reactivation
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'permission_reactivated',
        resource: 'permissions',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: true,
        metadata: {
          targetUserId: userId,
          resourceName,
          permissionName,
          permissionId: updatedPermission.id,
          expiresAt: updatedPermission.expiresAt?.toISOString(),
        },
      });

      logger.info(`Permission reactivated`, {
        permissionId: updatedPermission.id,
        userId,
        resourceName,
        permissionName,
        grantedBy: context.user_id,
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

    // Log successful grant
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'permission_granted',
      resource: 'permissions',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        targetUserId: userId,
        resourceName,
        permissionName,
        permissionId: newPermission.id,
        expiresAt: newPermission.expiresAt?.toISOString(),
      },
    });

    logger.info(`Permission granted`, {
      permissionId: newPermission.id,
      userId,
      resourceName,
      permissionName,
      grantedBy: context.user_id,
    });

    return NextResponse.json({ 
      message: 'Permission granted successfully',
      permission: newPermission 
    }, { status: 201 });

  } catch (error) {
    console.error('Error granting permission:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'validation_error',
          error_description: 'Invalid permission grant data',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'permission_grant_error',
      resource: 'permissions',
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

// DELETE /api/permissions - Revoke permission from user
async function handleRevokePermission(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const validatedParams = RevokePermissionSchema.parse(Object.fromEntries(searchParams.entries()));
    
    const { userId, resource: resourceName, permission: permissionName } = validatedParams;

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

    if (!userPermission) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'permission_revoke_not_found',
        resource: 'permissions',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Permission not found',
        metadata: {
          targetUserId: userId,
          resourceName,
          permissionName,
        },
      });

      return NextResponse.json(
        { 
          error: 'permission_not_found',
          error_description: 'Permission not found or already revoked',
        },
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

    // Log successful revocation
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'permission_revoked',
      resource: 'permissions',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        targetUserId: userId,
        resourceName,
        permissionName,
        permissionId: userPermission.id,
      },
    });

    logger.info(`Permission revoked`, {
      permissionId: userPermission.id,
      userId,
      resourceName,
      permissionName,
      revokedBy: context.user_id,
    });

    return NextResponse.json({ 
      message: 'Permission revoked successfully',
      revokedPermission: {
        id: userPermission.id,
        userId,
        resourceName,
        permissionName,
      },
    });

  } catch (error) {
    console.error('Error revoking permission:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'validation_error',
          error_description: 'Invalid revocation parameters',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'permission_revoke_error',
      resource: 'permissions',
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

// Apply OAuth 2.0 authentication with appropriate permissions
export const GET = withAuth(handleGetPermissions, {
  requiredScopes: ['permissions:read'],
  requiredPermissions: ['permissions:read'],
  requireUserContext: true,
});

export const POST = withAuth(handleGrantPermission, {
  requiredScopes: ['permissions:write', 'admin'],
  requiredPermissions: ['permissions:grant'],
  requireUserContext: true,
});

export const DELETE = withAuth(handleRevokePermission, {
  requiredScopes: ['permissions:write', 'admin'],
  requiredPermissions: ['permissions:revoke'],
  requireUserContext: true,
});
