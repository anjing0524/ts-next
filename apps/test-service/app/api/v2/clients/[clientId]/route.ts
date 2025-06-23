// 文件路径: app/api/v2/clients/[clientId]/route.ts
// 描述: 管理特定OAuth客户端 (获取、更新、删除)
// (Manage Specific OAuth Client - Get, Update, Delete)
// 注意: 路径参数 [clientId] 在代码中通常映射为 'id' (CUID) 进行数据库查找
// (Note: Path param [clientId] is typically mapped to 'id' (CUID) for DB lookup in code)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { OAuthClient, ClientType, Prisma } from '@prisma/client';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';

// --- 辅助函数 ---
function errorResponse(message: string, status: number, errorCode?: string, details?: any) {
  return NextResponse.json({ error: errorCode || 'request_failed', message, details }, { status });
}

function isValidHttpUrl(str: string, allowHttpLocalhost: boolean = true): boolean {
  if (str === null || str === undefined || typeof str !== 'string') return false; // Handle null or undefined input
  try {
    const url = new URL(str);
    if (allowHttpLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function sanitizeClientForResponse(client: OAuthClient | Partial<OAuthClient> | null): Partial<OAuthClient> | null {
  if (!client) return null;
  const { clientSecret, ...rest } = client as any;

  const output: Partial<OAuthClient> = { ...rest };
  const arrayFields: (keyof OAuthClient)[] = ['redirectUris', 'grantTypes', 'allowedScopes', 'responseTypes', 'ipWhitelist'];

  arrayFields.forEach(field => {
    const value = rest[field];
    if (value && typeof value === 'string') {
      try {
        output[field] = JSON.parse(value as string);
      } catch (e) {
        console.error(`Error parsing JSON string field '${field}' for client ID ${client.id}:`, e);
        output[field] = []; // Default to empty array on parsing error for safety
      }
    } else if (value === null && output[field] !== undefined) {
      output[field] = null;
    } else if (Array.isArray(value)) {
      output[field] = value;
    }
  });
  return output;
}

interface RouteContext {
  params: {
    clientId: string; // This will be the CUID 'id' of the OAuthClient
  };
}

// --- GET /api/v2/clients/{id} (获取客户端详情) ---
async function getClientByIdHandler(req: AuthenticatedRequest, context: RouteContext) {
  const targetDbId = context.params.clientId;
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  try {
    const client = await prisma.oAuthClient.findUnique({ where: { id: targetDbId } });
    if (!client) {
      await AuthorizationUtils.logAuditEvent({
          actorType: 'USER', actorId: performingAdmin?.id!, userId: performingAdmin?.id, action: 'CLIENT_READ_FAILURE_NOT_FOUND', status: 'FAILURE',
          resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent, errorMessage: 'OAuth Client not found.',
      });
      return errorResponse('OAuth Client not found.', 404, 'client_not_found');
    }

    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: performingAdmin?.id!, userId: performingAdmin?.id, action: 'CLIENT_READ_SUCCESS', status: 'SUCCESS',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        details: JSON.stringify({ clientId: client.clientId, clientName: client.clientName }),
    });
    return NextResponse.json(sanitizeClientForResponse(client), { status: 200 });
  } catch (error: any) {
    console.error(`Error fetching client ${targetDbId}:`, error);
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: performingAdmin?.id!, userId: performingAdmin?.id, action: 'CLIENT_READ_FAILURE_DB_ERROR', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: 'Error fetching client.', details: JSON.stringify({ error: error.message }),
    });
    return errorResponse('An unexpected error occurred while fetching the client.', 500, 'server_error');
  }
}
export const GET = requirePermission('clients:read')(getClientByIdHandler);


// --- PUT /api/v2/clients/{id} (全量更新客户端信息) ---
async function updateClientHandler(req: AuthenticatedRequest, context: RouteContext) {
  const targetDbId = context.params.clientId;
  const adminUserId = req.user?.id;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  let requestBody: Partial<Omit<OAuthClient, 'id' | 'clientId' | 'clientSecret' | 'createdAt' | 'updatedAt'>>;
  try {
    requestBody = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_UPDATE_FAILURE_INVALID_JSON', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: 'Invalid JSON for client update (PUT).', details: JSON.stringify({ error: e.message }),
    });
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  if ((requestBody as any).clientId) return errorResponse('The human-readable clientId string cannot be changed.', 400, 'validation_error_clientId_immutable');
  if ((requestBody as any).clientSecret) return errorResponse('Client secret cannot be changed directly. Use a dedicated secret regeneration endpoint.', 400, 'validation_error_secret_immutable');

  if (requestBody.redirectUris && (!Array.isArray(requestBody.redirectUris) || requestBody.redirectUris.length === 0 || !requestBody.redirectUris.every(uri => typeof uri === 'string' && isValidHttpUrl(uri)))) {
    return errorResponse('redirectUris must be a non-empty array of valid HTTPS URLs (HTTP for localhost allowed).', 400, 'validation_error_redirectUris');
  }

  try {
    const existingClient = await prisma.oAuthClient.findUnique({ where: { id: targetDbId }});
    if (!existingClient) {
      await AuthorizationUtils.logAuditEvent({
          actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_UPDATE_FAILURE_NOT_FOUND', status: 'FAILURE',
          resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent, errorMessage: 'Client not found for PUT update.',
      });
      return errorResponse('OAuth Client not found to update.', 404, 'client_not_found');
    }

    const updateData: Prisma.OAuthClientUpdateInput = {};
    const arrayFieldsToStringify: (keyof Pick<OAuthClient, 'redirectUris' | 'grantTypes' | 'allowedScopes' | 'responseTypes' | 'ipWhitelist'>)[] = ['redirectUris', 'grantTypes', 'allowedScopes', 'responseTypes', 'ipWhitelist'];
    arrayFieldsToStringify.forEach(field => {
        if (requestBody[field] !== undefined) {
            if (requestBody[field] === null) {
                updateData[field] = Prisma.DbNull;
            } else if (Array.isArray(requestBody[field])) {
                updateData[field] = JSON.stringify(requestBody[field]);
            }
        }
    });

    if (requestBody.clientName !== undefined) updateData.clientName = requestBody.clientName.trim();
    if (requestBody.clientDescription !== undefined) updateData.clientDescription = requestBody.clientDescription;
    if (requestBody.logoUri !== undefined) updateData.logoUri = isValidHttpUrl(requestBody.logoUri, false) ? requestBody.logoUri : null;

    if (requestBody.clientType !== undefined) {
        if (!Object.values(ClientType).includes(requestBody.clientType as ClientType)) return errorResponse(`clientType must be one of: ${Object.values(ClientType).join(', ')}.`, 400, 'validation_error_clientType');
        updateData.clientType = requestBody.clientType;
        if (requestBody.clientType === ClientType.PUBLIC && (requestBody.tokenEndpointAuthMethod || existingClient.tokenEndpointAuthMethod) !== 'none') {
            updateData.tokenEndpointAuthMethod = 'none';
            updateData.clientSecret = null;
        }
    }
    if (requestBody.tokenEndpointAuthMethod !== undefined) {
        const finalClientType = updateData.clientType || existingClient.clientType;
        if (finalClientType === ClientType.PUBLIC && requestBody.tokenEndpointAuthMethod !== 'none') return errorResponse('Public clients must use "none" for tokenEndpointAuthMethod.', 400, 'validation_error_public_auth');
        if (finalClientType === ClientType.CONFIDENTIAL && requestBody.tokenEndpointAuthMethod === 'none') return errorResponse('Confidential clients must use an authentication method.', 400, 'validation_error_confidential_auth');
        updateData.tokenEndpointAuthMethod = requestBody.tokenEndpointAuthMethod;
    }

    if (requestBody.requirePkce !== undefined) updateData.requirePkce = Boolean(requestBody.requirePkce);
    if (requestBody.requireConsent !== undefined) updateData.requireConsent = Boolean(requestBody.requireConsent);
    if (requestBody.isActive !== undefined) updateData.isActive = Boolean(requestBody.isActive);

    if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date();
    } else {
        return NextResponse.json(sanitizeClientForResponse(existingClient), { status: 200 });
    }

    const updatedClient = await prisma.oAuthClient.update({
      where: { id: targetDbId },
      data: updateData,
    });

    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_UPDATE_SUCCESS', status: 'SUCCESS',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        details: JSON.stringify({ updatedFields: Object.keys(requestBody), originalClientId: existingClient.clientId }),
    });
    return NextResponse.json(sanitizeClientForResponse(updatedClient), { status: 200 });

  } catch (error: any) {
    console.error(`Error PUT updating client ${targetDbId} by admin ${adminUserId}:`, error);
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_UPDATE_FAILURE_DB_ERROR', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: 'Error updating client (PUT).', details: JSON.stringify({ error: error.message, attemptedData: requestBody }),
    });
    return errorResponse('An unexpected error occurred while updating client.', 500, 'server_error');
  }
}
export const PUT = requirePermission('clients:update')(updateClientHandler);

// --- PATCH /api/v2/clients/{id} (部分更新客户端信息) ---
async function patchClientHandler(req: AuthenticatedRequest, context: RouteContext) {
  const targetDbId = context.params.clientId;
  const adminUserId = req.user?.id;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  let requestBody: Partial<Omit<OAuthClient, 'id' | 'clientId' | 'clientSecret' | 'createdAt' | 'updatedAt'>>;
  try {
    requestBody = await req.json();
  } catch (e: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_PATCH_FAILURE_INVALID_JSON', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: 'Invalid JSON for client patch.', details: JSON.stringify({ error: e.message }),
    });
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  if (Object.keys(requestBody).length === 0) {
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_PATCH_FAILURE_EMPTY_BODY', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent, errorMessage: 'Empty body for client patch.',
    });
    return errorResponse('Request body cannot be empty for PATCH operations.', 400, 'validation_error_empty_body');
  }
  if ((requestBody as any).clientId) return errorResponse('The human-readable clientId string cannot be changed.', 400, 'validation_error_clientId_immutable');
  if ((requestBody as any).clientSecret) return errorResponse('Client secret cannot be changed directly.', 400, 'validation_error_secret_immutable');

  const patchData: Prisma.OAuthClientUpdateInput = {};

  if (requestBody.clientName !== undefined) patchData.clientName = requestBody.clientName.trim();
  if (requestBody.clientDescription !== undefined) patchData.clientDescription = requestBody.clientDescription;

  const arrayFieldsToPatch: (keyof Pick<OAuthClient, 'redirectUris' | 'grantTypes' | 'allowedScopes' | 'responseTypes' | 'ipWhitelist'>)[] = ['redirectUris', 'grantTypes', 'allowedScopes', 'responseTypes', 'ipWhitelist'];
  arrayFieldsToPatch.forEach(field => {
    if (requestBody[field] !== undefined) {
        if (requestBody[field] === null) {
            patchData[field] = Prisma.DbNull;
        } else if (Array.isArray(requestBody[field])) {
            if (field === 'redirectUris' && (!Array.isArray(requestBody.redirectUris) || requestBody.redirectUris.length === 0 || !requestBody.redirectUris.every(uri => typeof uri === 'string' && isValidHttpUrl(uri)))) {
                 // Validation for redirectUris should be here or via Zod schema
            } else {
                 patchData[field] = JSON.stringify(requestBody[field]);
            }
        }
    }
  });

  if (requestBody.logoUri !== undefined) {
      if(requestBody.logoUri !== null && !isValidHttpUrl(requestBody.logoUri, false)) return errorResponse('logoUri must be a valid HTTPS URL or null.', 400, 'validation_error_logoUri');
      patchData.logoUri = requestBody.logoUri;
  }

  if (requestBody.clientType !== undefined) {
    if (!Object.values(ClientType).includes(requestBody.clientType as ClientType)) return errorResponse(`clientType must be one of: ${Object.values(ClientType).join(', ')}.`, 400, 'validation_error_clientType');
    patchData.clientType = requestBody.clientType;
    if (requestBody.clientType === ClientType.PUBLIC) {
        patchData.clientSecret = null;
        patchData.tokenEndpointAuthMethod = 'none';
    }
  }
  if (requestBody.tokenEndpointAuthMethod !== undefined) {
    patchData.tokenEndpointAuthMethod = requestBody.tokenEndpointAuthMethod;
  }

  if (requestBody.requirePkce !== undefined) patchData.requirePkce = Boolean(requestBody.requirePkce);
  if (requestBody.requireConsent !== undefined) patchData.requireConsent = Boolean(requestBody.requireConsent);
  if (requestBody.isActive !== undefined) patchData.isActive = Boolean(requestBody.isActive);

  if (Object.keys(patchData).length === 0) {
    const currentClient = await prisma.oAuthClient.findUnique({ where: { id: targetDbId } });
    return NextResponse.json(sanitizeClientForResponse(currentClient), { status: 200 });
  }
  patchData.updatedAt = new Date();

  try {
    const updatedClient = await prisma.oAuthClient.update({
      where: { id: targetDbId },
      data: patchData,
    });
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_PATCH_SUCCESS', status: 'SUCCESS',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        details: JSON.stringify({ patchedFields: Object.keys(requestBody) }),
    });
    return NextResponse.json(sanitizeClientForResponse(updatedClient), { status: 200 });
  } catch (error: any) {
    console.error(`Error PATCH updating client ${targetDbId} by admin ${adminUserId}:`, error);
    const existingClientCheck = await prisma.oAuthClient.findUnique({ where: { id: targetDbId }, select: {id: true}});
    if (!existingClientCheck) {
        await AuthorizationUtils.logAuditEvent({
            actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_PATCH_FAILURE_NOT_FOUND', status: 'FAILURE',
            resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent, errorMessage: 'Client not found for PATCH update (during DB operation).',
        });
         return errorResponse('OAuth Client not found to update.', 404, 'client_not_found');
    }
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_PATCH_FAILURE_DB_ERROR', status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: 'Error patching client.', details: JSON.stringify({ error: error.message, attemptedPatchData: patchData }),
    });
    return errorResponse('An unexpected error occurred while updating client.', 500, 'server_error');
  }
}
export const PATCH = requirePermission('clients:update')(patchClientHandler);


// --- DELETE /api/v2/clients/{id} (删除客户端) ---
async function deleteClientHandler(req: AuthenticatedRequest, context: RouteContext) {
  const targetDbId = context.params.clientId;
  const adminUserId = req.user?.id!;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');

  try {
    const clientToDelete = await prisma.oAuthClient.findUnique({ where: { id: targetDbId } });
    if (!clientToDelete) {
      await AuthorizationUtils.logAuditEvent({
          actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_DELETE_FAILURE_NOT_FOUND', status: 'FAILURE',
          resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent, errorMessage: 'Client not found to delete.',
      });
      return errorResponse('OAuth Client not found to delete.', 404, 'client_not_found');
    }

    await prisma.oAuthClient.delete({ where: { id: targetDbId } });

    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: 'CLIENT_DELETE_SUCCESS', status: 'SUCCESS',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        details: JSON.stringify({ deletedClientIdString: clientToDelete.clientId, clientName: clientToDelete.clientName }),
    });
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error(`Error deleting client ${targetDbId} by admin ${adminUserId}:`, error);
    let errorMessage = 'An unexpected error occurred while deleting client.';
    let actionCode = 'CLIENT_DELETE_FAILURE_DB_ERROR';
    let httpStatus = 500;

     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003' || error.code === 'P2014') {
            errorMessage = 'Cannot delete client: It might be referenced by other records (e.g., tokens, consent grants).';
            actionCode = 'CLIENT_DELETE_FAILURE_FOREIGN_KEY';
            httpStatus = 409;
        } else if (error.code === 'P2025') {
             errorMessage = 'Client not found to delete (P2025). This might happen if it was deleted concurrently.';
             actionCode = 'CLIENT_DELETE_FAILURE_NOT_FOUND_PRISMA';
             httpStatus = 404;
        }
    }
    await AuthorizationUtils.logAuditEvent({
        actorType: 'USER', actorId: adminUserId!, userId: adminUserId, action: actionCode, status: 'FAILURE',
        resourceType: 'OAuthClient', resourceId: targetDbId, ipAddress, userAgent,
        errorMessage: errorMessage, details: JSON.stringify({ error: error.message, clientNameAttemptedDelete: clientToDelete?.clientName || 'N/A' }),
    });
    return errorResponse(errorMessage, httpStatus, actionCode);
  }
}
export const DELETE = requirePermission('clients:delete')(deleteClientHandler);

// 确保 JWTUtils.verifyV2AuthAccessToken 存在
/*
declare module '@/lib/auth/oauth2' { ... }
*/
