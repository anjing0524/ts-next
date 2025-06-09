import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Allowed permission categories
const permissionCategories = ['system', 'app', 'api', 'data', 'page'] as const;

// Schema for creating a new permission
const CreatePermissionSchema = z.object({
  identifier: z.string().min(3, 'Identifier must be at least 3 characters').max(100)
    .regex(/^[a-z0-9_]+:[a-z0-9_]+:[a-z0-9_]+$/, 'Identifier must be in format category:resource:action (e.g., system:user:create)'),
  name: z.string().min(3, 'Permission name must be at least 3 characters').max(100),
  description: z.string().max(255).optional(),
  category: z.enum(permissionCategories, { errorMap: () => ({ message: `Category must be one of: ${permissionCategories.join(', ')}` }) }),
  resource: z.string().min(1, 'Resource is required').max(50)
    .regex(/^[a-z0-9_]+$/, 'Resource can only contain lowercase letters, numbers, and underscores'),
  action: z.string().min(1, 'Action is required').max(50)
    .regex(/^[a-z0-9_]+$/, 'Action can only contain lowercase letters, numbers, and underscores'),
}).refine(data => data.identifier === `${data.category}:${data.resource}:${data.action}`, {
  message: "Identifier must exactly match category:resource:action",
  path: ["identifier"], // Point error to identifier field
});

// POST /api/permissions - Create a new permission
async function createPermission(request: NextRequest, authContext: AuthContext) {
  try {
    const body = await request.json();
    const validationResult = CreatePermissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { identifier, name, description, category, resource, action } = validationResult.data;

    const existingPermission = await prisma.permission.findUnique({
      where: { identifier },
    });
    if (existingPermission) {
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'permission_create_failed_duplicate',
        resource: `permission:${identifier}`,
        success: false,
        errorMessage: 'Permission identifier already exists',
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'Permission identifier already exists' }, { status: 409 });
    }

    const newPermission = await prisma.permission.create({
      data: {
        identifier,
        name,
        description,
        category,
        resource,
        action,
        // createdBy: authContext.user_id, // If you add a createdBy field
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_created',
      resource: `permission:${newPermission.id}`,
      success: true,
      metadata: { permissionIdentifier: newPermission.identifier, name: newPermission.name },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(newPermission, { status: 201 });

  } catch (error) {
    console.error('Error creating permission:', error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'permission_create_failed_exception',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to create permission' }, { status: 500 });
  }
}

// GET /api/permissions - List all permissions
async function listPermissions(request: NextRequest, authContext: AuthContext) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const category = searchParams.get('category');
    const resource = searchParams.get('resource');
    const action = searchParams.get('action');
    const sortBy = searchParams.get('sortBy') || 'identifier';
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    const skip = (page - 1) * limit;
    
    const whereClause: any = {};
    if (category) whereClause.category = category;
    if (resource) whereClause.resource = resource;
    if (action) whereClause.action = action;

    const permissions = await prisma.permission.findMany({
      where: whereClause,
      take: limit,
      skip: skip,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    const totalPermissions = await prisma.permission.count({ where: whereClause });

    return NextResponse.json({
      data: permissions,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalPermissions / limit),
        totalItems: totalPermissions,
      },
    }, { status: 200 });

  } catch (error) {
    console.error('Error listing permissions:', error);
    return NextResponse.json({ error: 'Failed to list permissions' }, { status: 500 });
  }
}

// Apply auth middleware. Users need 'system:permission:manage' permission.
// For GET, a more granular 'system:permission:read' could be used if defined.
export const POST = withAuth(createPermission, { requiredPermissions: ['system:permission:manage'] });
export const GET = withAuth(listPermissions, { requiredPermissions: ['system:permission:manage'] });
