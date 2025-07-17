import { Permission as PrismaPermission } from '@repo/database';

// We can extend the Prisma-generated type if we need to add client-side properties
// For now, we can just re-export it.
export type Permission = PrismaPermission;
