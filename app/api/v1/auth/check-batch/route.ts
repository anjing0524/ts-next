import { NextRequest, NextResponse } from 'next/server';

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { PermissionService } from '@/lib/services/permissionService';

import {
  BatchPermissionCheckRequestSchema,
  BatchIndividualCheckRequestType,
} from './schemas'; // Path relative to current dir

const permissionService = new PermissionService();

// Interface for requests to PermissionService, if it differs from client-facing schema
interface PermissionServiceRequest {
  id?: string; // Corresponds to client's requestId for correlation
  name: string; // The permission string, e.g., "resource:action"
  // Add other attributes if your PermissionService.checkBatchPermissions expects more
}

async function checkBatchPermissionHandler(request: NextRequest) {
  const requestId = (request as { requestId?: string }).requestId; // Overall requestId for this batch operation from withErrorHandler
  const body = await request.json();

  // Validate the request body
  const validationResult = BatchPermissionCheckRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.flatten((issue) => issue.message).fieldErrors;
    const combinedErrorMessage = Object.entries(errorMessages)
      .map(([key, messages]) => `${key}: ${messages?.join(', ')}`)
      .join('; ');
    throw new ApiError(400, `Invalid request body: ${combinedErrorMessage}`, 'VALIDATION_ERROR');
  }

  const { subjectAttributes, requests: clientRequests } = validationResult.data;

  // Transform client requests into the format expected by PermissionService
  const serviceRequests: PermissionServiceRequest[] = clientRequests.map(
    (req: BatchIndividualCheckRequestType) => ({
      id: req.requestId, // Pass along the client's requestId for this individual check
      name: `${req.resourceAttributes.resourceId}:${req.action.type}`, // Construct permission name
    })
  );

  // Call the permission service
  // Assuming PermissionService.checkBatchPermissions returns an array of results corresponding to serviceRequests
  // Example structure of a result item: { id?: string, allowed: boolean, reasonCode?: string, message?: string }
  const serviceResults = await permissionService.checkBatchPermissions(
    subjectAttributes.userId,
    serviceRequests
  );

  // Adapt serviceResults to the PRD's specified response format for each item
  const responseResults = serviceResults.map((sr) => ({
    requestId: sr.id, // This was the original req.requestId from the client's batch
    allowed: sr.allowed,
    reasonCode: sr.reasonCode || (sr.allowed ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED'),
    message:
      sr.message ||
      (sr.allowed ? 'Operation allowed for this item.' : 'Operation denied for this item.'),
    // matchedPolicyIds: sr.matchedPolicyIds || [] // Optional, if your service provides this
  }));

  return NextResponse.json(
    successResponse(
      { results: responseResults },
      200,
      'Batch permission check completed.',
      requestId
    ),
    { status: 200 }
  );
}

export const POST = withErrorHandler(
  withAuth(checkBatchPermissionHandler, {
    requiredPermissions: ['auth:check-batch:execute'], // Example permission to call this API
    requireUserContext: false, // Can be called by services or users with the right perm
  })
);
