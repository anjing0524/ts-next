import type { Menu as PrismaMenu } from '@repo/database';

/**
 * Represents a menu item in the application, extending the Prisma-generated type.
 * This allows for adding client-side specific properties or nested structures.
 */
export interface MenuItem extends PrismaMenu {
  children?: MenuItem[];
  // permissions?: string[]; // Optional: If you want to attach required permissions directly
}
