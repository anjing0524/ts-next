// DEPRECATED: This endpoint is deprecated as of YYYY-MM-DD.
// Please use the new endpoint at /api/permissions/check for batch permission evaluations.
// This file will be removed in a future version.
// app/api/auth/check-batch/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware'; // Assuming this middleware handles auth
// import { prisma } from '@/lib/prisma'; // No longer needed directly for permission fetching
import { PermissionService } from '@/lib/services/permissionService'; // Import new service

// Instantiate the service
const permissionService = new PermissionService();

// Single permission check request's Zod Schema (remains the same for request validation)
const IndividualCheckRequestSchema = z.object({
  requestId: z.string().optional(),
  resourceAttributes: z.object({
    resourceId: z.string(),
    resourceType: z.string().optional(),
  }),
  action: z.object({
    type: z.string(),
  }),
  environmentAttributes: z.record(z.any()).optional(),
});

// Batch permission check request body's Zod Schema (remains the same for request validation)
const BatchCheckRequestBodySchema = z.object({
  subjectAttributes: z.object({
    userId: z.string(),
  }),
  requests: z.array(IndividualCheckRequestSchema).min(1),
});

// The local getUserEffectivePermissions function is REMOVED.

interface ServiceAuthContext extends AuthContext {
  callingServiceId?: string;
}

// DEPRECATED: This endpoint is deprecated as of YYYY-MM-DD.
// Please use the new endpoint at /api/permissions/check for batch permission evaluations.
// This file will be removed in a future version.
// POST /api/auth/check-batch - Handles batch permission check requests
async function handleBatchPermissionCheck(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = BatchCheckRequestBodySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { subjectAttributes, requests: clientRequests } = validationResult.data;

    // 1. Adapt client requests to the format expected by PermissionService
    const serviceRequests = clientRequests.map((req) => ({
      id: req.requestId,
      resource: req.resourceAttributes.resourceId,
      action: req.action.type,
      // environmentAttributes are not directly used by the current PermissionService.checkBatchPermissions
      // If they become necessary, the service method will need to be updated.
    }));

    // 2. Call the new PermissionService
    const serviceResults = await permissionService.checkBatchPermissions(
      subjectAttributes.userId,
      serviceRequests
    );

    // 3. Adapt service results back to the format expected by the client
    const clientResults = serviceResults.map((sr) => ({
      requestId: sr.id, // Map 'id' back to 'requestId'
      allowed: sr.allowed,
      // Map reason codes and messages. The service provides:
      // PERMISSION_GRANTED, PERMISSION_DENIED, NO_PERMISSIONS, INVALID_REQUEST_FORMAT
      // The original route provided: NO_PERMISSIONS, PERMISSION_GRANTED, PERMISSION_DENIED
      // Ensure reasonCode and message are strings and provide defaults.
      reasonCode: sr.reasonCode || (sr.allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED'),
      message: sr.message || (sr.allowed ? 'Operation allowed.' : 'Operation denied.'),
    }));

    return NextResponse.json({ results: clientResults });
  } catch (error: unknown) {
    console.error('Batch permission check API encountered an error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An internal error occurred while processing permission requests.',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleBatchPermissionCheck, {
  // Assuming the permission required to call this batch check endpoint itself remains the same.
  // This might be a service-level permission.
  requiredPermissions: ['service:permission_check_batch'], // Example permission
  requireUserContext: false, // Typically, batch checks are by a service or an admin context for a user
});
