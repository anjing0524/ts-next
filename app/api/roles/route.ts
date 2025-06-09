import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware'; // Assuming this middleware handles auth and permissions
import { AuthorizationUtils } from '@/lib/auth/oauth2';

// Schema for creating a new role
const CreateRoleSchema = z.object({
  name: z.string().min(3, 'Role name must be at least 3 characters').max(50)
    .regex(/^[a-z0-9_]+$/, 'Role name can only contain lowercase letters, numbers, and underscores'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  description: z.string().max(255).optional(),
  parentId: z.string().uuid('Invalid parent role ID format').optional(),
  isSystem: z.boolean().optional().default(false),
});

// POST /api/roles - Create a new role
async function createRole(request: NextRequest, authContext: AuthContext) {
  try {
    const body = await request.json();
    const validationResult = CreateRoleSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { name, displayName, description, parentId, isSystem } = validationResult.data;

    // Check if role name (identifier) already exists
    const existingRole = await prisma.role.findUnique({
      where: { name },
    });
    if (existingRole) {
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id,
        action: 'role_create_failed_duplicate',
        resource: `role:${name}`,
        success: false,
        errorMessage: 'Role name already exists',
        ipAddress: request.ip || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ error: 'Role name already exists' }, { status: 409 });
    }

    // If parentId is provided, check if parent role exists
    if (parentId) {
      const parentRole = await prisma.role.findUnique({ where: { id: parentId } });
      if (!parentRole) {
        return NextResponse.json({ error: 'Parent role not found' }, { status: 400 });
      }
    }

    const newRole = await prisma.role.create({
      data: {
        name,
        displayName,
        description,
        parentId,
        isSystem,
        // createdBy: authContext.user_id, // If you add a createdBy field
      },
    });

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_created',
      resource: `role:${newRole.id}`,
      success: true,
      metadata: { roleName: newRole.name, displayName: newRole.displayName },
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(newRole, { status: 201 });

  } catch (error) {
    console.error('Error creating role:', error);
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      action: 'role_create_failed_exception',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.ip || request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}

// GET /api/roles - List all roles
async function listRoles(request: NextRequest, authContext: AuthContext) {
  try {
    // TODO: Add pagination, filtering, sorting
    const roles = await prisma.role.findMany({
      include: {
        // _count: { select: { users: true, permissions: true } }, // Example: include counts
        // children: true, // Example: include children for hierarchical view (can be heavy)
      },
      orderBy: {
        name: 'asc',
      },
    });

    // No specific audit log for listing, unless it's sensitive or has specific access patterns to monitor.
    // A general API access log might cover this if enabled at a higher level.

    return NextResponse.json(roles, { status: 200 });

  } catch (error) {
    console.error('Error listing roles:', error);
    // No specific audit log for failure here unless desired.
    return NextResponse.json({ error: 'Failed to list roles' }, { status: 500 });
  }
}

// Apply auth middleware. Users need 'system:role:manage' permission.
export const POST = withAuth(createRole, { requiredPermissions: ['system:role:manage'] });
export const GET = withAuth(listRoles, { requiredPermissions: ['system:role:manage'] }); // Or a more granular 'system:role:read'
