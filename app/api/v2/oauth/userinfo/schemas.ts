// app/api/v2/oauth/userinfo/schemas.ts
import { z } from 'zod';

/**
 * Schema for the UserInfo response.
 * Based on OpenID Connect Core 1.0 Section 5.3.2 (Standard Claims)
 * and available fields in the Prisma User model.
 */
export const userInfoResponseSchema = z.object({
  /**
   * Subject - Identifier for the End-User at the Issuer. (REQUIRED)
   */
  sub: z.string(),

  /**
   * End-User's full name in displayable form.
   * Mapped from User.displayName or constructed from firstName/lastName.
   * (Available if 'profile' scope was granted)
   */
  name: z.string().optional(),

  /**
   * Given name(s) or first name(s) of the End-User.
   * Mapped from User.firstName.
   * (Available if 'profile' scope was granted)
   */
  given_name: z.string().optional(),

  /**
   * Surname(s) or last name(s) of the End-User.
   * Mapped from User.lastName.
   * (Available if 'profile' scope was granted)
   */
  family_name: z.string().optional(),

  /**
   * Shorthand name by which the End-User wishes to be referred to.
   * Mapped from User.username.
   * (Available if 'profile' scope was granted)
   */
  preferred_username: z.string().optional(),

  /**
   * URL of the End-User's profile picture.
   * Mapped from User.avatar.
   * (Available if 'profile' scope was granted)
   */
  picture: z.string().url().optional(),

  /**
   * Time the End-User's information was last updated. (UNIX timestamp)
   * Mapped from User.updatedAt.
   * (Available if 'profile' scope was granted - typically)
   */
  updated_at: z.number().int().positive().optional(),

  // Custom claims based on Prisma User model
  /**
   * User's organization.
   * (Custom claim, potentially available if 'profile' or a custom scope was granted)
   */
  organization: z.string().optional(),

  /**
   * User's department.
   * (Custom claim, potentially available if 'profile' or a custom scope was granted)
   */
  department: z.string().optional(),

  // NOTE: Standard OIDC claims like email, email_verified, phone_number, address, etc.,
  // are omitted here because corresponding fields are not present in the current Prisma User model.
  // If these fields are added to the User model and relevant scopes (email, phone, address)
  // are supported, this schema should be updated accordingly.
});

export type UserInfoResponse = z.infer<typeof userInfoResponseSchema>;
