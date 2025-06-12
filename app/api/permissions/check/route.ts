// DEPRECATED: This endpoint is deprecated. Please use /api/v1/auth/check-batch instead.
// This file may be removed in a future version.
// /app/api/permissions/check/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // Import AuthorizationUtils
import { PermissionService } from '@/lib/services/permissionService';

const permissionService = new PermissionService();

const IndividualPermissionCheckSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Canonical permission name is required'),
});

const BatchCheckRequestBodySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  requests: z
    .array(IndividualPermissionCheckSchema)
    .min(1, 'At least one permission request is required'),
});

async function handlePermissionsCheck(request: NextRequest, authContext: AuthContext) {
  // authContext provided by withAuth
  console.warn(
    'DEPRECATION WARNING: /api/permissions/check is deprecated. Use /api/v1/auth/check-batch or /api/v1/auth/check.'
  );
  const requestUrl = request.url;
  // Prefer 'x-real-ip' if behind a trusted proxy, fallback to 'x-forwarded-for', then to undefined
  const ipAddress =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const body = await request.json();
    const validationResult = BatchCheckRequestBodySchema.safeParse(body);

    if (!validationResult.success) {
      // Audit log for validation failure
      await AuthorizationUtils.logAuditEvent({
        userId: authContext.user_id, // User making the check request (from JWT sub or client_id for client_credentials)
        clientId: authContext.client_id, // Client application making the request
        action: 'permissions_check_validation_failed',
        resource: requestUrl,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Invalid request body for permission check.',
        metadata: { errors: validationResult.error.flatten() },
      });
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { userId: targetUserId, requests: permissionRequests } = validationResult.data;

    // Audit log for initiation of permission check
    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      clientId: authContext.client_id,
      action: 'permissions_check_invoked',
      resource: requestUrl,
      ipAddress,
      userAgent,
      success: true, // Assuming the call to the endpoint itself is successful at this stage
      metadata: {
        targetUserId: targetUserId,
        numberOfRequests: permissionRequests.length,
        // To avoid logging potentially sensitive permission names in bulk,
        // consider logging only IDs or a summary if detailed request logging is needed.
        // requestedPermissionsSample: permissionRequests.slice(0, 5).map(p => p.id || p.name)
      },
    });

    const serviceResults = await permissionService.checkBatchPermissions(
      targetUserId,
      permissionRequests
    );

    // Optional: Audit log for the outcome of the permission check if specific results need to be audited.
    // For example, if any permission was denied or if critical permissions were checked.
    // This can become very verbose if logged for every request.
    // await AuthorizationUtils.logAuditEvent({
    //   userId: authContext.user_id,
    //   clientId: authContext.client_id,
    //   action: 'permissions_check_completed',
    //   resource: requestUrl,
    //   ipAddress,
    //   userAgent,
    //   success: true, // Or based on whether all checks passed
    //   metadata: { targetUserId: targetUserId, resultsSummary: serviceResults.map(r => ({id: r.id, allowed: r.allowed})) },
    // });

    return NextResponse.json({ results: serviceResults });
  } catch (error: unknown) {
    console.error('Permissions check API encountered an error:', error);

    // Ensure targetUserId is available for logging if parsing succeeded before error
    let targetUserIdForErrorLog: string | undefined = undefined;
    try {
      // Attempt to parse body again to get targetUserId if error happened after validation
      // This is a bit optimistic and might fail if body is not JSON or structure is wrong
      const bodyForError = await request.json(); // This might re-throw if body is malformed
      const parsedBodyForError = BatchCheckRequestBodySchema.safeParse(bodyForError);
      if (parsedBodyForError.success) {
        targetUserIdForErrorLog = parsedBodyForError.data.userId;
      }
    } catch (parseError) {
      // Ignore if parsing body for error logging fails
    }

    await AuthorizationUtils.logAuditEvent({
      userId: authContext.user_id,
      clientId: authContext.client_id,
      action: 'permissions_check_error',
      resource: requestUrl,
      ipAddress,
      userAgent,
      success: false,
      errorMessage:
        error instanceof Error ? error.message : 'Internal server error during permission check.',
      metadata: { targetUserId: targetUserIdForErrorLog, errorDetails: error.toString() },
    });

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An internal error occurred while processing permission check requests.',
      },
      { status: 500 }
    );
  }
}

// Secure this endpoint. Define what permission is needed to call this general check endpoint.
export const POST = withAuth(handlePermissionsCheck, {
  requiredPermissions: ['permissions:check:execute'], // Placeholder - adjust as per actual permission design
  // requireUserContext: true, // Set based on whether the caller must be a user or can be a service client
});
