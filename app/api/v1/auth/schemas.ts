import { z } from 'zod';

// For Single Permission Check (/api/v1/auth/check)
const SubjectAttributesSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

const ResourceAttributesSchema = z.object({
  resourceId: z.string().min(1, 'Resource ID is required'), // e.g., "orders", "documentX"
});

const ActionSchema = z.object({
  type: z.string().min(1, 'Action type is required'), // e.g., "read", "write"
});

const EnvironmentAttributesSchema = z.record(z.any()).optional();

export const SinglePermissionCheckRequestSchema = z.object({
  subjectAttributes: SubjectAttributesSchema,
  resourceAttributes: ResourceAttributesSchema,
  action: ActionSchema,
  environmentAttributes: EnvironmentAttributesSchema.optional(),
});

export type SinglePermissionCheckRequestType = z.infer<typeof SinglePermissionCheckRequestSchema>;

// For Batch Permission Check (/api/v1/auth/check-batch)
const BatchIndividualCheckRequestSchema = z.object({
  requestId: z.string().optional(),
  resourceAttributes: ResourceAttributesSchema,
  action: ActionSchema,
  environmentAttributes: EnvironmentAttributesSchema.optional(),
});

export const BatchPermissionCheckRequestSchema = z.object({
  subjectAttributes: SubjectAttributesSchema,
  requests: z
    .array(BatchIndividualCheckRequestSchema)
    .min(1, 'At least one permission request is required'),
});

export type BatchPermissionCheckRequestType = z.infer<typeof BatchPermissionCheckRequestSchema>;
export type BatchIndividualCheckRequestType = z.infer<typeof BatchIndividualCheckRequestSchema>;
