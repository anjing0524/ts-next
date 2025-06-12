import { NextRequest, NextResponse } from 'next/server';

import { successResponse } from '@/lib/api/apiResponse';
import { withErrorHandler, ApiError } from '@/lib/api/errorHandler';
import { withAuth, AuthContext } from '@/lib/auth/middleware';
import { PermissionService } from '@/lib/services/permissionService';

import { SinglePermissionCheckRequestSchema, SinglePermissionCheckRequestType } from './schemas'; // Path relative to current dir

const permissionService = new PermissionService();

async function checkSinglePermissionHandler(request: NextRequest, context: AuthContext) {
  const requestId = (request as any).requestId; // From withErrorHandler
  const body = await request.json();

  // Validate the request body
  const validationResult = SinglePermissionCheckRequestSchema.safeParse(body);
  if (!validationResult.success) {
    // Flatten Zod errors for a more readable message
    const errorMessages = validationResult.error.flatten((issue) => issue.message).fieldErrors;
    const combinedErrorMessage = Object.entries(errorMessages)
      .map(([key, messages]) => `${key}: ${messages?.join(', ')}`)
      .join('; ');
    throw new ApiError(400, `Invalid request body: ${combinedErrorMessage}`, 'VALIDATION_ERROR');
  }

  const { subjectAttributes, resourceAttributes, action } = validationResult.data;

  // Construct permission name, e.g., "resourceId:actionType"
  // This is a common convention, adjust if your permission names are different
  const permissionName = `${resourceAttributes.resourceId}:${action.type}`;

  // Assuming PermissionService.checkPermission expects userId and a permission string
  const hasPermission = await permissionService.checkPermission(
    subjectAttributes.userId,
    permissionName
  );

  const decision = {
    allowed: hasPermission,
    reasonCode: hasPermission ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
    message: hasPermission ? 'Permission granted.' : 'Permission denied.',
    // matchedPolicyIds: [] // Optional, if policies are involved and service returns them
  };

  return NextResponse.json(
    successResponse(decision, 200, 'Permission check completed.', requestId),
    { status: 200 }
  );
}

export const POST = withErrorHandler(
  withAuth(checkSinglePermissionHandler, {
    requiredPermissions: ['auth:check:execute'], // Example permission to call this API
    requireUserContext: false, // Can be called by services or users with the right perm
  })
);
