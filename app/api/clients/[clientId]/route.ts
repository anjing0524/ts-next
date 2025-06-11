import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import * as bcrypt from 'bcrypt';
import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { prisma } from '@/lib/prisma';
import logger from '@/utils/logger';

// Validation schema for client updates
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
  jwksUri: z.string().url().optional(),
  logoUri: z.string().url().optional(),
  policyUri: z.string().url().optional(),
  tosUri: z.string().url().optional(),
  regenerateSecret: z.boolean().optional(),
});

// GET /api/clients/[clientId] - Get specific client details (admin only)
async function handleGetClient(
  request: NextRequest, 
  context: AuthContext
): Promise<NextResponse> {
  try {
    // Extract clientId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];

    // Find client by clientId
    const client = await prisma.client.findFirst({
      where: { clientId },
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
        jwksUri: true,
        logoUri: true,
        policyUri: true,
        tosUri: true,
        createdAt: true,
        updatedAt: true,
        // Don't include clientSecret for security
      },
    });

    if (!client) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'client_not_found',
        resource: `clients/${clientId}`,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Client not found',
        metadata: { requestedClientId: clientId },
      });

      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Log access
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_viewed',
      resource: `clients/${clientId}`,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        viewedClientId: client.clientId,
        viewedClientName: client.name,
      },
    });

    return NextResponse.json({
      ...client,
      redirectUris: JSON.parse(client.redirectUris),
      grantTypes: JSON.parse(client.grantTypes),
      responseTypes: JSON.parse(client.responseTypes),
    });

  } catch (error) {
    console.error('Error fetching client:', error);
    
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_view_error',
      resource: `clients/unknown`,
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

// PUT /api/clients/[clientId] - Update specific client (admin only)
async function handleUpdateClient(
  request: NextRequest,
  context: AuthContext
): Promise<NextResponse> {
  try {
    // Extract clientId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];
    
    const body = await request.json();
    const validatedData = UpdateClientSchema.parse(body);

    // Find existing client
    const existingClient = await prisma.client.findFirst({
      where: { clientId },
    });

    if (!existingClient) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Validate business rules
    if (validatedData.grantTypes && validatedData.responseTypes) {
      if (validatedData.grantTypes.includes('authorization_code') && 
          !validatedData.responseTypes.includes('code')) {
        return NextResponse.json(
          {
            error: 'invalid_client_metadata',
            error_description: 'authorization_code grant type requires code response type',
          },
          { status: 400 }
        );
      }
    }

    // Handle secret regeneration
    let rawNewClientSecret: string | null = null;
    let hashedNewClientSecret: string | null = existingClient.clientSecret; // Keep old if not regenerating

    if (validatedData.regenerateSecret && !existingClient.isPublic) {
      rawNewClientSecret = crypto.randomBytes(32).toString('hex');
      const saltRounds = 10; // Or a configurable value
      hashedNewClientSecret = await bcrypt.hash(rawNewClientSecret, saltRounds);
    } else if (validatedData.regenerateSecret && existingClient.isPublic) {
      // Cannot regenerate secret for public client if it somehow becomes non-public then public again
      // Or if isPublic is being changed in the same request.
      // In this case, clientSecret should be null.
      hashedNewClientSecret = null;
    }


    // Build update data
    const updateData: any = {};
    
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.redirectUris !== undefined) {
      updateData.redirectUris = JSON.stringify(validatedData.redirectUris);
    }
    if (validatedData.grantTypes !== undefined) {
      updateData.grantTypes = JSON.stringify(validatedData.grantTypes);
    }
    if (validatedData.responseTypes !== undefined) {
      updateData.responseTypes = JSON.stringify(validatedData.responseTypes);
    }
    if (validatedData.scope !== undefined) updateData.scope = validatedData.scope;
    if (validatedData.isPublic !== undefined) updateData.isPublic = validatedData.isPublic;
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;
    if (validatedData.requirePkce !== undefined) updateData.requirePkce = validatedData.requirePkce;
    if (validatedData.requireConsent !== undefined) updateData.requireConsent = validatedData.requireConsent;
    if (validatedData.tokenEndpointAuthMethod !== undefined) {
      updateData.tokenEndpointAuthMethod = validatedData.tokenEndpointAuthMethod;
    }
    if (validatedData.jwksUri !== undefined) updateData.jwksUri = validatedData.jwksUri;
    if (validatedData.logoUri !== undefined) updateData.logoUri = validatedData.logoUri;
    if (validatedData.policyUri !== undefined) updateData.policyUri = validatedData.policyUri;
    if (validatedData.tosUri !== undefined) updateData.tosUri = validatedData.tosUri;
    // Only update clientSecret in DB if it was actually changed/regenerated
    if (hashedNewClientSecret !== existingClient.clientSecret) {
      updateData.clientSecret = hashedNewClientSecret;
    }

    // If client is being made public, clientSecret must be null
    if (validatedData.isPublic === true) {
      updateData.clientSecret = null;
      // Also, ensure rawNewClientSecret is not returned for public clients
      rawNewClientSecret = null;
    }


    // Update client
    const updatedClient = await prisma.client.update({
      where: { id: existingClient.id },
      data: updateData,
      select: {
        id: true,
        clientId: true,
        clientSecret: validatedData.regenerateSecret ? true : false, // Only return secret if regenerated
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
        jwksUri: true,
        logoUri: true,
        policyUri: true,
        tosUri: true,
        updatedAt: true,
      },
    });

    // Log update
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_updated',
      resource: `clients/${clientId}`,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        updatedClientId: updatedClient.clientId,
        updatedFields: Object.keys(updateData),
        secretRegenerated: validatedData.regenerateSecret || false,
      },
    });

    logger.info(`OAuth 2.0 client updated`, {
      clientId: updatedClient.clientId,
      updatedBy: context.user_id,
      updatedFields: Object.keys(updateData),
    });

    const response = {
      ...updatedClient,
      redirectUris: JSON.parse(updatedClient.redirectUris),
      grantTypes: JSON.parse(updatedClient.grantTypes),
      responseTypes: JSON.parse(updatedClient.responseTypes),
    };

    // Include new secret if it was regenerated
    if (rawNewClientSecret) { // This implies it was regenerated and not for a public client
      response.clientSecret = rawNewClientSecret;
    } else if (validatedData.regenerateSecret && existingClient.isPublic && updateData.clientSecret === null) {
      // If a public client had 'regenerateSecret' somehow set to true,
      // and it's becoming non-public in the same request,
      // we should not return a secret as one wasn't generated.
      // However, the current logic already sets clientSecret to null for public clients.
      // This case is more of a safeguard.
      delete response.clientSecret; // Ensure no old secret is present if it became public.
    } else if (response.clientSecret && validatedData.isPublic === true) {
        // If client is updated to be public, don't return any secret
        delete response.clientSecret;
    }


    return NextResponse.json(response);

  } catch (error) {
    console.error('Error updating client:', error);

    // Extract clientId from URL for error logging
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'validation_error',
          error_description: 'Invalid update data',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_update_error',
      resource: `clients/${clientId}`,
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

// DELETE /api/clients/[clientId] - Delete specific client (admin only)
async function handleDeleteClient(
  request: NextRequest,
  context: AuthContext
): Promise<NextResponse> {
  try {
    // Extract clientId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];

    // Find existing client
    const existingClient = await prisma.client.findFirst({
      where: { clientId },
    });

    if (!existingClient) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Revoke all tokens for this client first
    await Promise.all([
      prisma.accessToken.updateMany({
        where: { clientId: existingClient.id },
        data: { revoked: true, revokedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { clientId: existingClient.id },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    // Delete the client
    await prisma.client.delete({
      where: { id: existingClient.id },
    });

    // Log deletion
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_deleted',
      resource: `clients/${clientId}`,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        deletedClientId: existingClient.clientId,
        deletedClientName: existingClient.name,
      },
    });

    logger.info(`OAuth 2.0 client deleted`, {
      clientId: existingClient.clientId,
      deletedBy: context.user_id,
    });

    return NextResponse.json({
      message: 'Client deleted successfully',
      clientId: existingClient.clientId,
    });

  } catch (error) {
    console.error('Error deleting client:', error);
    
    // Extract clientId from URL for error logging
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];
    
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_deletion_error',
      resource: `clients/${clientId}`,
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
export const GET = withAuth(handleGetClient, {
  requiredScopes: ['clients:read', 'admin'],
  requiredPermissions: ['clients:view'],
  requireUserContext: true,
});

export const PUT = withAuth(handleUpdateClient, {
  requiredScopes: ['clients:write', 'admin'],
  requiredPermissions: ['clients:update'],
  requireUserContext: true,
});

export const DELETE = withAuth(handleDeleteClient, {
  requiredScopes: ['clients:write', 'admin'],
  requiredPermissions: ['clients:delete'],
  requireUserContext: true,
}); 