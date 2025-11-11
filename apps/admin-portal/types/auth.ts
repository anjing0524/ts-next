import { OAuthClient, Role as PrismaRole, Permission as PrismaPermission } from '@repo/database';

/**
 * Represents the user object returned from the backend.
 */
export interface User {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  department: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  userRoles: { roleId: string }[];
  // Add other user properties as needed
}

/**
 * Represents the structure of the tokens received from the OAuth server.
 */
export interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Represents the structure of an audit log entry.
 * Based on the Prisma schema.
 */
export interface AuditLog {
  id: string;
  timestamp: Date; // Keep as Date object for easier manipulation
  userId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: any; // JSON object
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  user?: {
    username: string;
  };
}

/**
 * Represents the OAuthClient entity for the frontend.
 */
export type Client = OAuthClient;

/**
 * Represents the form data for creating/editing an OAuth client.
 */
export interface ClientFormData {
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  // Add other form fields as needed
}

/**
 * Represents the Role entity for the frontend.
 */
export type Role = PrismaRole;

/**
 * Represents the form data for creating/editing a Role.
 */
export interface RoleFormData {
  name: string;
  description?: string;
  permissions: string[];
}

/**
 * Represents the Permission entity for the frontend.
 */
export type Permission = PrismaPermission;
