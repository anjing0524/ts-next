import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2';
import { z } from 'zod';
import crypto from 'crypto';
import logger from '@/utils/logger';

// Enhanced validation schema for OAuth 2.0 client registration
const ClientRegisterSchema = z.object({
  name: z.string().min(1).max(255, 'Client name must be between 1 and 255 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  redirectUris: z.array(z.string().url('Each redirect URI must be a valid URL')).min(1, 'At least one redirect URI is required'),
  grantTypes: z.array(z.enum(['authorization_code', 'client_credentials', 'refresh_token']))
    .min(1, 'At least one grant type is required')
    .default(['authorization_code', 'refresh_token']),
  responseTypes: z.array(z.enum(['code', 'token', 'id_token']))
    .default(['code']),
  scope: z.string().optional(),
  isPublic: z.boolean().default(false),
  requirePkce: z.boolean().default(true),
  requireConsent: z.boolean().default(true),
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'none'])
    .default('client_secret_basic'),
  jwksUri: z.string().url('JWKS URI must be a valid URL').optional(),
  logoUri: z.string().url('Logo URI must be a valid URL').optional(),
  policyUri: z.string().url('Policy URI must be a valid URL').optional(),
  tosUri: z.string().url('Terms of Service URI must be a valid URL').optional(),
});

// POST /api/clients/register - Register new OAuth 2.0 client (admin only)
async function handleClientRegistration(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validatedData = ClientRegisterSchema.parse(body);

    // Check if client with same name already exists
    const existingClient = await prisma.client.findFirst({
      where: { name: validatedData.name },
    });

    if (existingClient) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'client_registration_duplicate',
        resource: 'clients/register',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Client name already exists',
        metadata: {
          attemptedName: validatedData.name,
          existingClientId: existingClient.clientId,
        },
      });

      return NextResponse.json(
        { 
          error: 'client_already_exists',
          error_description: 'A client with this name already exists',
        },
        { status: 409 }
      );
    }

    // Generate OAuth 2.0 compliant client credentials
    const clientId = `oauth2_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = validatedData.isPublic ? null : crypto.randomBytes(32).toString('base64url');

    // Validate grant types and response types compatibility
    if (validatedData.grantTypes.includes('authorization_code') && !validatedData.responseTypes.includes('code')) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'authorization_code grant type requires code response type',
        },
        { status: 400 }
      );
    }

    // Public clients must use PKCE for authorization code flow
    if (validatedData.isPublic && validatedData.grantTypes.includes('authorization_code')) {
      validatedData.requirePkce = true;
      validatedData.tokenEndpointAuthMethod = 'none';
    }

    // Create the new OAuth client
    const newClient = await prisma.client.create({
      data: {
        clientId,
        clientSecret,
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
        jwksUri: validatedData.jwksUri,
        logoUri: validatedData.logoUri,
        policyUri: validatedData.policyUri,
        tosUri: validatedData.tosUri,
      },
      select: {
        id: true,
        clientId: true,
        clientSecret: true, // Include secret only on registration
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
      },
    });

    // Log successful registration
    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_registered',
      resource: 'clients/register',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: true,
      metadata: {
        registeredClientId: newClient.clientId,
        name: newClient.name,
        isPublic: newClient.isPublic,
        grantTypes: validatedData.grantTypes,
        redirectUris: validatedData.redirectUris,
        requirePkce: newClient.requirePkce,
      },
    });

    logger.info(`OAuth 2.0 client registered successfully`, {
      clientId: newClient.clientId,
      name: newClient.name,
      isPublic: newClient.isPublic,
      registeredBy: context.user_id,
    });

    // Return registration response according to OAuth 2.0 Dynamic Client Registration spec
    const response = {
      client_id: newClient.clientId,
      client_secret: newClient.clientSecret, // Only returned on registration
      client_name: newClient.name,
      client_description: newClient.description,
      redirect_uris: JSON.parse(newClient.redirectUris),
      grant_types: JSON.parse(newClient.grantTypes),
      response_types: JSON.parse(newClient.responseTypes),
      scope: newClient.scope,
      token_endpoint_auth_method: newClient.tokenEndpointAuthMethod,
      require_pkce: newClient.requirePkce,
      require_consent: newClient.requireConsent,
      jwks_uri: newClient.jwksUri,
      logo_uri: newClient.logoUri,
      policy_uri: newClient.policyUri,
      tos_uri: newClient.tosUri,
      client_id_issued_at: Math.floor(newClient.createdAt.getTime() / 1000),
    };

    // Remove null values
    Object.keys(response).forEach(key => {
      if (response[key as keyof typeof response] === null) {
        delete response[key as keyof typeof response];
      }
    });

    return NextResponse.json(response, { 
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Client registration error:', error);

    if (error instanceof z.ZodError) {
      await AuthorizationUtils.logAuditEvent({
        userId: context.user_id,
        clientId: context.client_id,
        action: 'client_registration_validation_error',
        resource: 'clients/register',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        success: false,
        errorMessage: 'Validation failed',
        metadata: {
          validationErrors: error.errors,
        },
      });

      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'Invalid client registration data',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('P2002')) {
      // Unique constraint violation
      return NextResponse.json(
        {
          error: 'client_already_exists',
          error_description: 'A client with these details already exists',
        },
        { status: 409 }
      );
    }

    await AuthorizationUtils.logAuditEvent({
      userId: context.user_id,
      clientId: context.client_id,
      action: 'client_registration_error',
      resource: 'clients/register',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    logger.error('Client registration failed', {
      error: error instanceof Error ? error.message : String(error),
      registeredBy: context.user_id,
    });

    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error during client registration',
      },
      { status: 500 }
    );
  }
}

// Apply OAuth 2.0 authentication with admin-level permissions
export const POST = withAuth(handleClientRegistration, {
  requiredScopes: ['clients:write', 'admin'],
  requiredPermissions: ['clients:register'],
  requireUserContext: true,
});
