// app/api/resources/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';
import logger from '@/utils/logger';

// Enhanced validation schemas
const CreateResourceSchema = z.object({
  name: z.string()
    .min(1, 'Resource name is required')
    .max(100, 'Resource name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9:_-]+$/, 'Resource name can only contain letters, numbers, colons, underscores, and hyphens'),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
});

const GetResourcesSchema = z.object({
  limit: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  search: z.string().optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

// GET /api/resources - List all resources (protected)
async function handleGetResources(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const validation = GetResourcesSchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid query parameters',
          validation_errors: validation.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const { limit, offset, search, isActive } = validation.data;

    // Build where clause
    const where: any = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get resources with pagination
    const [resources, totalCount] = await Promise.all([
      prisma.resource.findMany({
        where,
        orderBy: [
          { isActive: 'desc' },
          { name: 'asc' },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.resource.count({ where }),
    ]);

    // Log access
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'resources_list',
      resource: 'resources',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        limit,
        offset,
        totalCount,
        search: search || undefined,
        isActive,
      },
    });

    logger.info(`Resources listed successfully`, {
      resourceCount: resources.length,
      totalCount,
      listedBy: context.user_id,
    });

    return NextResponse.json({
      resources,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching resources:', error);
    
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'resources_list_error',
      resource: 'resources',
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

// POST /api/resources - Create a new resource (protected)
async function handleCreateResource(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = CreateResourceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'validation_error',
          error_description: 'Invalid resource data',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    const { name, description } = validation.data;

    // Check if resource already exists
    const existingResource = await prisma.resource.findUnique({
      where: { name },
    });

    if (existingResource) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'resource_creation_conflict',
        resource: 'resources',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Resource name already exists',
        metadata: {
          attemptedName: name,
          existingResourceId: existingResource.id,
        },
      });

      return NextResponse.json(
        {
          error: 'resource_already_exists',
          error_description: 'A resource with this name already exists',
        },
        { status: 409 }
      );
    }

    // Create resource
    const newResource = await prisma.resource.create({
      data: {
        name,
        description,
        isActive: true,
      },
    });

    // Log creation
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'resource_created',
      resource: 'resources',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        createdResourceId: newResource.id,
        name: newResource.name,
        description: newResource.description,
      },
    });

    logger.info(`Resource created successfully`, {
      resourceId: newResource.id,
      name: newResource.name,
      createdBy: context.user_id,
    });

    return NextResponse.json(newResource, { status: 201 });

  } catch (error) {
    console.error('Error creating resource:', error);

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'resource_creation_error',
      resource: 'resources',
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
export const GET = withAuth(handleGetResources, {
  requiredScopes: ['resources:read'],
  requiredPermissions: ['resources:list'],
  requireUserContext: true,
});

export const POST = withAuth(handleCreateResource, {
  requiredScopes: ['resources:write', 'admin'],
  requiredPermissions: ['resources:create'],
  requireUserContext: true,
});
