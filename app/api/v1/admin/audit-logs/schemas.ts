import { z } from 'zod';

export const AuditLogQuerySchema = z
  .object({
    page: z.preprocess(
      (val) => parseInt(z.string().default('1').parse(val), 10),
      z.number().int().min(1).default(1)
    ),
    limit: z.preprocess(
      (val) => parseInt(z.string().default('10').parse(val), 10),
      z.number().int().min(1).max(100).default(10) // Max 100 per page
    ),
    userId: z.string().cuid().optional(), // Assuming CUID for user IDs from Prisma schema
    action: z.string().min(1).optional(), // Action should not be empty if provided
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    success: z.preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined; // Important for optional boolean
    }, z.boolean().optional()),
    clientId: z.string().cuid().optional(), // Assuming CUID for client IDs from Prisma schema
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate && data.endDate < data.startDate) {
        return false;
      }
      return true;
    },
    {
      message: 'endDate cannot be earlier than startDate',
      path: ['endDate'], // Path to the failing field for error reporting
    }
  );

export type AuditLogQueryType = z.infer<typeof AuditLogQuerySchema>;
