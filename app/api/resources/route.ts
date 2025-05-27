// app/api/resources/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { z } from 'zod';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

// Zod schema for creating a Resource
const createResourceSchema = z.object({
  name: z.string().min(1, { message: "Resource name is required" }),
  description: z.string().optional(),
});

// POST /api/resources - Create a new Resource
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createResourceSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Create resource validation failed', { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, description } = validation.data;
    logger.info(`Attempting to create resource: ${name}`);

    const newResource = await prisma.resource.create({
      data: {
        name,
        description: description || null, // Ensure optional fields are handled correctly
      },
    });

    logger.info(`Resource created successfully: ${newResource.name} (ID: ${newResource.id})`);
    return NextResponse.json(newResource, { status: 201 });

  } catch (error: any) {
    logger.error('Error creating resource', { error });
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      logger.warn(`Conflict: Resource with name "${error.meta?.modelName || 'unknown'}" already exists.`); // modelName might not be directly on error.meta for this specific error.
      return NextResponse.json({ message: `A resource with the name '${(error.meta?.target as string[])?.join(', ')}' already exists.` }, { status: 409 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/resources - List all Resources
export async function GET() {
  try {
    logger.info('Fetching all resources');
    const resources = await prisma.resource.findMany();
    logger.info(`Successfully fetched ${resources.length} resources.`);
    return NextResponse.json(resources, { status: 200 });
  } catch (error: any) {
    logger.error('Error fetching resources', { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
