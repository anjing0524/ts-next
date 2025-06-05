// app/api/users/[userId]/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';
import { z } from 'zod';
import logger from '@/utils/logger';


// Zod schema for granting a permission
const grantPermissionSchema = z.object({
  resourceId: z.string().uuid({ message: "Invalid Resource ID format" }),
  permissionId: z.string().uuid({ message: "Invalid Permission ID format" }),
});

interface RouteContext {
  params: {
    userId: string;
  };
}

// POST /api/users/[userId]/permissions - Grant a permission to a user
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { userId } = await params;
  logger.info(`Attempting to grant permission to user ID: ${userId}`);

  let body: any = {}; // Declare body variable in broader scope

  try {
    body = await request.json();
    const validation = grantPermissionSchema.safeParse(body);

    if (!validation.success) {
      logger.warn(`Grant permission validation failed for user ID ${userId}`, { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { resourceId, permissionId } = validation.data;

    // Check if User, Resource, and Permission entities exist
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      logger.warn(`Grant permission failed: User with ID ${userId} not found.`);
      return NextResponse.json({ message: `User with ID ${userId} not found.` }, { status: 404 });
    }

    const resourceExists = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resourceExists) {
      logger.warn(`Grant permission failed: Resource with ID ${resourceId} not found.`);
      return NextResponse.json({ message: `Resource with ID ${resourceId} not found.` }, { status: 404 });
    }

    const permissionExists = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permissionExists) {
      logger.warn(`Grant permission failed: Permission with ID ${permissionId} not found.`);
      return NextResponse.json({ message: `Permission with ID ${permissionId} not found.` }, { status: 404 });
    }

    // Create the UserResourcePermission entry
    const newUserResourcePermission = await prisma.userResourcePermission.create({
      data: {
        userId,
        resourceId,
        permissionId,
      },
      include: { // Include related details for a more informative response
        resource: true,
        permission: true,
      }
    });

    logger.info(`Permission granted successfully for user ID ${userId}: Resource "${resourceExists.name}", Permission "${permissionExists.name}"`);
    return NextResponse.json(newUserResourcePermission, { status: 201 });

  } catch (error: any) {
    logger.error(`Error granting permission to user ID ${userId}:`, { error });
    if (error.code === 'P2002') { // Unique constraint violation
      logger.warn(`Grant permission conflict for user ID ${userId}: Permission likely already exists.`);
      // Optionally, fetch and return the existing permission
      const existingPermission = await prisma.userResourcePermission.findUnique({
        where: { 
            userId_resourceId_permissionId: {
                userId: userId,
                resourceId: (error.meta?.target as string[])?.includes('resourceId') ? body.resourceId : undefined, // These might not be reliable for P2002 on compound key
                permissionId: (error.meta?.target as string[])?.includes('permissionId') ? body.permissionId : undefined,
            }
        },
        include: { resource: true, permission: true }
      });
       if(existingPermission) {
         return NextResponse.json(existingPermission, { status: 200 }); // Return 200 if already exists
       }
      return NextResponse.json({ message: 'This permission is already granted to the user.' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/users/[userId]/permissions?resourceId=<resourceId>&permissionId=<permissionId> - Revoke a permission from a user
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { userId } = await params;
  const { searchParams } = new URL(request.url);
  const resourceId = searchParams.get('resourceId');
  const permissionId = searchParams.get('permissionId');

  logger.info(`Attempting to revoke permission for user ID: ${userId}, Resource ID: ${resourceId}, Permission ID: ${permissionId}`);

  if (!resourceId || !permissionId) {
    logger.warn(`Revoke permission validation failed for user ID ${userId}: Missing resourceId or permissionId in query params.`);
    return NextResponse.json({ message: 'Missing resourceId or permissionId in query parameters' }, { status: 400 });
  }

  // Optional: Validate UUID format for resourceId and permissionId from query if needed
  // const uuidSchema = z.string().uuid();
  // if (!uuidSchema.safeParse(resourceId).success || !uuidSchema.safeParse(permissionId).success) {
  //   return NextResponse.json({ message: 'Invalid resourceId or permissionId format in query parameters' }, { status: 400 });
  // }
  
  try {
    // Find the specific UserResourcePermission entry to get its ID for deletion,
    // or use Prisma's deleteMany with the compound key if preferred (though deleting by ID is often safer).
    // Here, using delete with the unique compound key.
    const result = await prisma.userResourcePermission.delete({
      where: {
        userId_resourceId_permissionId: {
          userId: userId,
          resourceId: resourceId,
          permissionId: permissionId,
        }
      },
    });

    logger.info(`Permission revoked successfully for user ID ${userId}: Resource ID ${resourceId}, Permission ID ${permissionId}`);
    return NextResponse.json({ message: "Permission revoked successfully" }, { status: 200 });
    // return new NextResponse(null, { status: 204 }); // No content response

  } catch (error: any) {
    logger.error(`Error revoking permission for user ID ${userId}, Resource ID ${resourceId}, Permission ID ${permissionId}:`, { error });
    if (error.code === 'P2025') { // Record to delete not found (thrown by `delete` if `where` condition not met)
      logger.warn(`Revoke permission failed: No matching permission found for user ID ${userId}, Resource ID ${resourceId}, Permission ID ${permissionId}.`);
      return NextResponse.json({ message: 'Permission assignment not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/users/[userId]/permissions - List all permissions for a user
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId } = await params;
  logger.info(`Fetching permissions for user ID: ${userId}`);

  try {
    // Check if user exists first
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
        logger.warn(`Cannot fetch permissions: User with ID ${userId} not found.`);
        return NextResponse.json({ message: `User with ID ${userId} not found.` }, { status: 404 });
    }
      
    const permissions = await prisma.userResourcePermission.findMany({
      where: { userId: userId },
      include: {
        resource: true,   // Include details of the related Resource
        permission: true, // Include details of the related Permission
      },
    });

    logger.info(`Successfully fetched ${permissions.length} permissions for user ID ${userId}.`);
    return NextResponse.json(permissions, { status: 200 });

  } catch (error: any) {
    logger.error(`Error fetching permissions for user ID ${userId}:`, { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
