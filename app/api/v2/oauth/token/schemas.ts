// app/api/v2/oauth/token/schemas.ts
import { z } from 'zod';

// --- Base Schemas for common parameters ---

const clientIdSchema = z.string({
  required_error: 'client_id is required.',
  invalid_type_error: 'client_id must be a string.',
}).min(1, 'client_id cannot be empty.');

const clientSecretSchema = z.string({
  required_error: 'client_secret is required for confidential clients.',
  invalid_type_error: 'client_secret must be a string.',
}).min(1, 'client_secret cannot be empty.');

const scopeSchema = z.string().optional(); // Optional scope for token requests

// --- Schemas for specific grant types ---

/**
 * Schema for the 'authorization_code' grant type.
 * RFC 6749 Section 4.1.3
 */
export const tokenAuthorizationCodeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string({ required_error: 'code is required.' })
    .min(1, 'code cannot be empty.'),
  redirect_uri: z.string({ required_error: 'redirect_uri is required.' })
    .url({ message: 'redirect_uri must be a valid URL.' }),
  client_id: clientIdSchema,
  /**
   * PKCE Code Verifier.
   * Required if the original authorization request included a code_challenge.
   * RFC 7636 Section 4.3
   */
  code_verifier: z.string({ required_error: 'code_verifier is required for PKCE.' })
    .min(43, 'code_verifier must be at least 43 characters for PKCE.')
    .max(128, 'code_verifier must be at most 128 characters.'),
  // client_secret might be required for confidential clients using auth code,
  // but often client auth is via Authorization header for this grant.
  // The spec allows client_secret in body if not using header auth.
  // We'll handle client authentication (header or body) separately in the route.
});
export type TokenAuthorizationCodeGrantPayload = z.infer<typeof tokenAuthorizationCodeGrantSchema>;

/**
 * Schema for the 'client_credentials' grant type.
 * RFC 6749 Section 4.4.2
 */
export const tokenClientCredentialsGrantSchema = z.object({
  grant_type: z.literal('client_credentials'),
  scope: scopeSchema,
  // client_id and client_secret might be sent in Authorization header (Basic Auth)
  // or in the request body. The route handler will need to accommodate both.
  // If they are in the body, they are validated here.
  client_id: clientIdSchema.optional(), // Optional here if Basic Auth is used
  client_secret: clientSecretSchema.optional(), // Optional here if Basic Auth is used
});
export type TokenClientCredentialsGrantPayload = z.infer<typeof tokenClientCredentialsGrantSchema>;

/**
 * Schema for the 'refresh_token' grant type.
 * RFC 6749 Section 6
 */
export const tokenRefreshTokenGrantSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string({ required_error: 'refresh_token is required.' })
    .min(1, 'refresh_token cannot be empty.'),
  scope: scopeSchema, // Optional: requested scope must be a subset of original scope
  // Client authentication is also required for confidential clients when refreshing tokens.
  client_id: clientIdSchema.optional(),
  client_secret: clientSecretSchema.optional(),
});
export type TokenRefreshTokenGrantPayload = z.infer<typeof tokenRefreshTokenGrantSchema>;


// --- Discriminated Union for all supported grant type schemas ---
// This allows parsing based on the grant_type value.
export const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  tokenAuthorizationCodeGrantSchema,
  tokenClientCredentialsGrantSchema,
  tokenRefreshTokenGrantSchema,
  // Future grant types can be added here, e.g.:
  // z.object({ grant_type: z.literal('urn:ietf:params:oauth:grant-type:jwt-bearer'), ... })
]);
export type TokenRequestPayload = z.infer<typeof tokenRequestSchema>;


// --- Token Response Schema ---
// RFC 6749 Section 5.1 (Successful Response)
export const tokenSuccessResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'), // Typically 'Bearer'
  expires_in: z.number().int().positive(), // Lifetime in seconds
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(), // Space-separated list of scopes
  // id_token: z.string().min(1).optional(), // For OIDC
});
export type TokenSuccessResponse = z.infer<typeof tokenSuccessResponseSchema>;

// RFC 6749 Section 5.2 (Error Response)
export const tokenErrorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional(),
});
export type TokenErrorResponse = z.infer<typeof tokenErrorResponseSchema>;
