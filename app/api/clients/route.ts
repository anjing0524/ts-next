import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';
import crypto from 'crypto';
import * as bcrypt from 'bcrypt';

// Validation schemas
const GetClientsSchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  search: z.string().optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isPublic: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
});

const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url()).min(1),
  grantTypes: z.array(z.enum(['authorization_code', 'client_credentials', 'refresh_token'])).min(1),
  responseTypes: z.array(z.enum(['code', 'token', 'id_token'])).default(['code']),
  scope: z.string().optional(),
  isPublic: z.boolean().default(false),
  requirePkce: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'none']).default('client_secret_basic'),
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  redirectUris: z.array(z.string().url()).optional(),
  grantTypes: z.array(z.enum(['authorization_code', 'client_credentials', 'refresh_token'])).optional(),
  responseTypes: z.array(z.enum(['code', 'token', 'id_token'])).optional(),
  scope: z.string().optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  requirePkce: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'none']).optional(),
});

// GET /api/clients - List OAuth clients (admin only)
async function handleGetClients(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  
  try {
    // Validate query parameters
    const validation = GetClientsSchema.safeParse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      search: searchParams.get('search'),
      isActive: searchParams.get('isActive'),
      isPublic: searchParams.get('isPublic'),
    });

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

    const { limit, offset, search, isActive, isPublic } = validation.data;

    // Build where clause
    const where: any = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    if (search) {
      where.OR = [
        { clientId: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count and clients
    const [totalCount, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        select: {
          id: true,
          clientId: true,
          name: true,
          description: true,
          isPublic: true,
          isActive: true,
          requirePkce: true,
          requireConsent: true,
          tokenEndpointAuthMethod: true,
          redirectUris: true,
          grantTypes: true,
          responseTypes: true,
          scope: true,
          createdAt: true,
          updatedAt: true,
          // Don't include clientSecret for security
        },
        orderBy: [
          { createdAt: 'desc' },
          { name: 'asc' },
        ],
        take: Math.min(limit, 100), // Cap at 100
        skip: offset,
      })
    ]);

    // Log access
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'clients_list',
      resource: 'clients',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        limit,
        offset,
        totalCount,
        search: search || undefined,
        isActive,
        isPublic,
      },
    });

    return NextResponse.json({
      clients: clients.map(client => ({
        ...client,
        redirectUris: JSON.parse(client.redirectUris),
        grantTypes: JSON.parse(client.grantTypes),
        responseTypes: JSON.parse(client.responseTypes),
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'clients_list_error',
      resource: 'clients',
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

// POST /api/clients - Create new OAuth client (admin only)
async function handleCreateClient(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validatedData = CreateClientSchema.parse(body);

    // Generate client ID and secret
    const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;
    let clientSecret: string | null = null;
    let hashedSecret: string | null = null;

    if (!validatedData.isPublic) {
      clientSecret = crypto.randomBytes(32).toString('hex');
      const saltRounds = 10; // Or a configurable value
      hashedSecret = await bcrypt.hash(clientSecret, saltRounds);
    }

    // Create client in database
    const clientData = {
      clientId,
      clientSecret: hashedSecret,
        name: validatedData.name,
        description: validatedData.description,
        redirectUris: JSON.stringify(validatedData.redirectUris),
        grantTypes: JSON.stringify(validatedData.grantTypes),
        responseTypes: JSON.stringify(validatedData.responseTypes),
        scope: validatedData.scope,
        isPublic: validatedData.isPublic,
        isActive: true,
        requirePkce: validatedData.requirePkce,
        requireConsent: validatedData.requireConsent,
        tokenEndpointAuthMethod: validatedData.tokenEndpointAuthMethod,
      },
      select: {
        id: true,
        clientId: true,
        clientSecret: true, // Include secret only on creation
        name: true,
        description: true,
        isPublic: true,
        isActive: true,
        requirePkce: true,
        requireConsent: true,
        tokenEndpointAuthMethod: true,
        redirectUris: true,
        grantTypes: true,
        responseTypes: true,
        scope: true,
        createdAt: true,
      },
    });

    // IMPORTANT: Return the raw secret to the admin ONCE on creation
    // It will not be stored in raw format.
    if (clientSecret) {
      (client as any).clientSecret = clientSecret;
    }

    // Log creation
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_created',
      resource: 'clients',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        createdClientId: client.clientId,
        name: client.name,
        isPublic: client.isPublic,
        grantTypes: validatedData.grantTypes,
        redirectUris: validatedData.redirectUris,
      },
    });

    return NextResponse.json({
      ...client,
      redirectUris: JSON.parse(client.redirectUris),
      grantTypes: JSON.parse(client.grantTypes),
      responseTypes: JSON.parse(client.responseTypes),
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating client:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'validation_error',
          error_description: 'Invalid request data',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_creation_error',
      resource: 'clients',
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

// Apply OAuth 2.0 authentication with admin-level permissions
export const GET = withAuth(handleGetClients, {
  requiredScopes: ['clients:read', 'admin'],
  requiredPermissions: ['clients:list'],
  requireUserContext: true,
});

export const POST = withAuth(handleCreateClient, {
  requiredScopes: ['clients:write', 'admin'],
  requiredPermissions: ['clients:create'],
  requireUserContext: true,
}); 