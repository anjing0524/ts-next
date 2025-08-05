// app/api/v2/oauth/revoke/schemas.ts
import { z } from 'zod';

/**
 * Schema for the token revocation request body.
 * RFC 7009 Section 2.1
 */
export const revokeTokenRequestSchema = z.object({
  /**
   * The token that the client wants to get revoked.
   * This is a REQUIRED parameter.
   */
  token: z
    .string({
      required_error: 'token is required.',
      invalid_type_error: 'token must be a string.',
    })
    .min(1, 'token cannot be empty.'),

  /**
   * A hint about the type of the token submitted for revocation.
   * OPTIONAL. Clients MAY include this parameter to help the
   * authorization server locate the token.
   * e.g., "access_token", "refresh_token".
   */
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),

  /**
   * The client ID.
   * REQUIRED if the client is not authenticating with the authorization server
   * (e.g., a public client that was not issued a client secret).
   * Optional if client is authenticated via other means (e.g. HTTP Basic Auth).
   * The route handler will perform client authentication.
   */
  client_id: z.string().min(1, 'client_id cannot be empty if provided.').optional(),
  // client_secret: z.string().optional(), // Only if client auth is via body params, typically header.
});

export type RevokeTokenRequestPayload = z.infer<typeof revokeTokenRequestSchema>;

// No specific success response body defined by RFC 7009 for revocation.
// A 200 OK status code is used for successful revocations or if the token is invalid
// (to prevent leaking information about token validity). Some implementations might return an empty body.

// Error responses can use the standard OAuth2 error format from ../token/schemas.ts if needed,
// though RFC 7009 doesn't strictly mandate it for /revoke endpoint errors.
// For simplicity, we might just return appropriate status codes (e.g., 400, 401).
