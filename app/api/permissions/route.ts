// app/api/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma';
import { z } from 'zod';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

// Zod schema for creating a Permission
const createPermissionSchema = z.object({
  name: z.string().min(1, { message: "Permission name is required" }),
  description: z.string().optional(),
});

// POST /api/permissions - Create a new Permission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createPermissionSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Create permission validation failed', { errors: validation.error.flatten().fieldErrors });
      return NextResponse.json({ errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, description } = validation.data;
    logger.info(`Attempting to create permission: ${name}`);

    const newPermission = await prisma.permission.create({
      data: {
        name,
        description: description || null,
      },
    });

    logger.info(`Permission created successfully: ${newPermission.name} (ID: ${newPermission.id})`);
    return NextResponse.json(newPermission, { status: 201 });

  } catch (error: any) {
    logger.error('Error creating permission', { error });
    if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
      logger.warn(`Conflict: Permission with name "${name}" already exists.`); // Use 'name' from validation.data
      return NextResponse.json({ message: `A permission with the name '${name}' already exists.` }, { status: 409 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/permissions - List all Permissions
export async function GET() {
  try {
    logger.info('Fetching all permissions');
    const permissions = await prisma.permission.findMany();
    logger.info(`Successfully fetched ${permissions.length} permissions.`);
    return NextResponse.json(permissions, { status: 200 });
  } catch (error: any) {
    logger.error('Error fetching permissions', { error });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
