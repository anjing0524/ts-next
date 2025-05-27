// app/api/permissions/[permissionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { z } from 'zod';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

// Zod schema for updating a Permission
const updatePermissionSchema = z.object({
  name: z.string().min(1, { message: "Permission name cannot be empty if provided" }).optional(),
  description: z.string().optional(),
});

interface RouteContext {
  params: {
    permissionId: string;
  };
}

// GET /api/permissions/[permissionId] - Get a specific Permission by ID
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { permissionId } = params;
  logger.info(`Attempting to fetch permission with ID: ${permissionId}`);

  try {
    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      logger.warn(`Permission with ID: ${permissionId} not found.`);
      return NextResponse.json({ message: 'Permission not found' }, { status: 404 });
    }

    logger.info(`Permission fetched successfully: ${permission.name} (ID: ${permissionId})`);
    return NextResponse.json(permission, { status: 200 });
  } catch (error: any) {
    logger.error(`Error fetching permission ID ${permissionId}:`, { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/permissions/[permissionId] - Update a specific Permission by ID
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { permissionId } = params;
  let requestBody; // For logging in case of error
  logger.info(`Attempting to update permission with ID: ${permissionId}`);

  try {
    requestBody = await request.json();
    const validation = updatePermissionSchema.safeParse(requestBody);

    if (!validation.success) {
      logger.warn(`Update permission validation failed for ID ${permissionId}`, { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, description } = validation.data;

    // Ensure at least one field is being updated
    if (name === undefined && description === undefined) {
        logger.warn(`Update attempt for permission ID ${permissionId} with no data.`);
        return NextResponse.json({ message: "No fields provided for update." }, { status: 400 });
    }
    
    const dataToUpdate: { name?: string; description?: string | null } = {};
    if (name !== undefined) dataToUpdate.name = name;
    // If description is explicitly passed as null, it should be set to null.
    // If description is undefined (not passed), it should not be updated.
    // If description is a string, it should be updated.
    if (description !== undefined) dataToUpdate.description = description;


    const updatedPermission = await prisma.permission.update({
      where: { id: permissionId },
      data: dataToUpdate,
    });

    logger.info(`Permission updated successfully: ${updatedPermission.name} (ID: ${permissionId})`);
    return NextResponse.json(updatedPermission, { status: 200 });

  } catch (error: any) {
    logger.error(`Error updating permission ID ${permissionId}:`, { error });
    if (error.code === 'P2025') { // Record to update not found
      logger.warn(`Update failed: Permission with ID ${permissionId} not found.`);
      return NextResponse.json({ message: 'Permission not found' }, { status: 404 });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      logger.warn(`Update conflict for permission ID ${permissionId}: Name "${requestBody?.name}" already exists.`);
      return NextResponse.json({ message: `A permission with the name '${requestBody?.name}' already exists.` }, { status: 409 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/permissions/[permissionId] - Delete a specific Permission by ID
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { permissionId } = params;
  logger.info(`Attempting to delete permission with ID: ${permissionId}`);

  try {
    await prisma.permission.delete({
      where: { id: permissionId },
    });

    logger.info(`Permission deleted successfully: (ID: ${permissionId})`);
    return NextResponse.json({ message: "Permission deleted successfully" }, { status: 200 });
    // Alternatively, return new NextResponse(null, { status: 204 }); for no content response

  } catch (error: any) {
    logger.error(`Error deleting permission ID ${permissionId}:`, { error });
    if (error.code === 'P2025') { // Record to delete not found
      logger.warn(`Delete failed: Permission with ID ${permissionId} not found.`);
      return NextResponse.json({ message: 'Permission not found' }, { status: 404 });
    }
    // Note: onDelete: Cascade in `UserResourcePermission` model for `permissionId`
    // handles cleanup of related user-resource-permission entries.
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
