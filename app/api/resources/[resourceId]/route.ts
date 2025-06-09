// app/api/resources/[resourceId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {prisma} from '@/lib/prisma';
import { z } from 'zod';
import logger from '@/utils/logger';
import { withAuth, ApiHandler } from '@/lib/auth/token-validation'; // Adjust path as necessary
import { JWTPayload } from 'jose';


// Zod schema for updating a Resource
const updateResourceSchema = z.object({
  name: z.string().min(1, { message: "Resource name cannot be empty if provided" }).optional(),
  description: z.string().optional(),
});

interface RouteContext {
  params: {
    resourceId: string;
  };
}

// Original GET handler logic, now also accepts validatedClaims
const getResourceByIdHandler: ApiHandler = async (
  request: NextRequest,
  { params }: { params: { resourceId: string } }, // Destructure params from the second argument
  validatedClaims: JWTPayload
) => {
  const { resourceId } = await params; // resourceId is directly from params
  logger.info(`Attempting to fetch resource with ID: ${resourceId} by user ${validatedClaims.sub}`);

  try {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      logger.warn(`Resource with ID: ${resourceId} not found.`);
      return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
    }

    logger.info(`Resource fetched successfully: ${resource.name} (ID: ${resourceId}) by user ${validatedClaims.sub}`);
    // Example of using claims:
    // logger.info(`Request by user ${validatedClaims.sub} with permissions ${validatedClaims.permissions}`);
    return NextResponse.json(resource, { status: 200 });
  } catch (error: any) {
    logger.error(`Error fetching resource ID ${resourceId}:`, { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
};

// Protected GET handler
// The 'params' for withAuth's returned function will be { params: { resourceId: '...' } }
// The 'params' for the actual ApiHandler will be { resourceId: '...' } after destructuring
export const GET = withAuth(getResourceByIdHandler, "resource:read");


// PUT /api/resources/[resourceId] - Update a specific Resource by ID
// For demonstration, let's protect PUT as well, requiring "resource:write"
const updateResourceHandler: ApiHandler = async (
  request: NextRequest, 
  { params }: { params: { resourceId: string } }, 
  validatedClaims: JWTPayload
) => {
  const { resourceId } = await params;
  logger.info(`Attempting to update resource with ID: ${resourceId} by user ${validatedClaims.sub}`);
  let body;
  try {
    body = await request.json();
    const validation = updateResourceSchema.safeParse(body);

    if (!validation.success) {
      logger.warn(`Update resource validation failed for ID ${resourceId}`, { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, description } = validation.data;

    // Ensure at least one field is being updated
    if (name === undefined && description === undefined) {
        logger.warn(`Update attempt for resource ID ${resourceId} with no data.`);
        return NextResponse.json({ message: "No fields provided for update." }, { status: 400 });
    }
    
    const dataToUpdate: { name?: string; description?: string | null } = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (description !== undefined) dataToUpdate.description = description;


    const updatedResource = await prisma.resource.update({
      where: { id: resourceId },
      data: dataToUpdate,
    });

    logger.info(`Resource updated successfully: ${updatedResource.name} (ID: ${resourceId})`);
    return NextResponse.json(updatedResource, { status: 200 });

  } catch (error: any) {
    logger.error(`Error updating resource ID ${resourceId}:`, { error });
    if (error.code === 'P2025') { // Record to update not found
      logger.warn(`Update failed: Resource with ID ${resourceId} not found.`);
      return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      logger.warn(`Update conflict for resource ID ${resourceId}: Name "${body?.name}" already exists. User: ${validatedClaims.sub}`);
      return NextResponse.json({ message: `A resource with the name '${body?.name}' already exists.` }, { status: 409 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
};

export const PUT = withAuth(updateResourceHandler, "resource:write");


// DELETE /api/resources/[resourceId] - Delete a specific Resource by ID
// For demonstration, let's protect DELETE as well, requiring "resource:delete"
const deleteResourceHandler: ApiHandler = async (
  request: NextRequest, 
  { params }: { params: { resourceId: string } }, 
  validatedClaims: JWTPayload
) => {
  const { resourceId } = await params;
  logger.info(`Attempting to delete resource with ID: ${resourceId} by user ${validatedClaims.sub}`);

  try {
    await prisma.resource.delete({
      where: { id: resourceId },
    });

    logger.info(`Resource deleted successfully: (ID: ${resourceId}) by user ${validatedClaims.sub}`);
    return NextResponse.json({ message: "Resource deleted successfully" }, { status: 200 });
    // return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    logger.error(`Error deleting resource ID ${resourceId} by user ${validatedClaims.sub}:`, { error });
    if (error.code === 'P2025') { // Record to delete not found
      logger.warn(`Delete failed: Resource with ID ${resourceId} not found. User: ${validatedClaims.sub}`);
      return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
};

export const DELETE = withAuth(deleteResourceHandler, "resource:delete");
