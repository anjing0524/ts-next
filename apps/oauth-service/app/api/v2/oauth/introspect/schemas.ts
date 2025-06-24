// app/api/v2/oauth/introspect/schemas.ts
import { z } from 'zod';

/**
 * Schema for the token introspection request body.
 * RFC 7662 Section 2.1
 */
export const introspectTokenRequestSchema = z.object({
  /**
   * The token that the client wants to get introspected. (REQUIRED)
   */
  token: z.string({
    required_error: 'token is required.',
    invalid_type_error: 'token must be a string.',
  }).min(1, 'token cannot be empty.'),

  /**
   * A hint about the type of the token submitted for introspection. (OPTIONAL)
   * e.g., "access_token", "refresh_token".
   */
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),

  /**
   * Client identifier (OPTIONAL in request body)
   * Usually provided via Basic Auth header, but can be in body
   */
  client_id: z.string().optional(),

  // Client authentication (client_id, client_secret) for the resource server
  // making the introspection request is typically handled via HTTP Basic Authentication header.
  // If sent in body, they could be added here, but header is preferred.
  // For this schema, we focus on the token itself.
});

export type IntrospectTokenRequestPayload = z.infer<typeof introspectTokenRequestSchema>;


/**
 * Schema for a successful token introspection response when the token is active.
 * RFC 7662 Section 2.2
 * Includes common claims, but can be extended.
 */
export const introspectResponseActiveSchema = z.object({
  /**
   * Boolean indicator of whether or not the presented token is currently active. (REQUIRED)
   */
  active: z.literal(true),

  /**
   * A JSON string containing a space-separated list of scopes associated with this token.
   */
  scope: z.string().optional(),

  /**
   * Client identifier for the OAuth 2.0 client that requested this token.
   */
  client_id: z.string(),

  /**
   * Human-readable identifier for the resource owner who authorized this token.
   * Usually a username.
   */
  username: z.string().optional(), // Typically from User table if sub is user ID

  /**
   * Type of the token as defined in Section 5.1 of RFC 6749.
   * e.g., "Bearer".
   */
  token_type: z.string().optional(), // e.g., "Bearer" for access tokens

  /**
   * Integer timestamp, measured in the number of seconds since January 1 1970 UTC,
   * indicating when this token will expire.
   */
  exp: z.number().int().positive().optional(),

  /**
   * Integer timestamp, measured in the number of seconds since January 1 1970 UTC,
   * indicating when this token was originally issued.
   */
  iat: z.number().int().positive().optional(),

  /**
   * Integer timestamp, measured in the number of seconds since January 1 1970 UTC,
   * indicating when this token is not to be used before.
   */
  nbf: z.number().int().positive().optional(),

  /**
   * Subject of the token, as defined in JWT [RFC7519].
   * Usually a machine-readable identifier of the resource owner.
   */
  sub: z.string().optional(),

  /**
   * Service-specific string identifier or list of string identifiers representing the audience(s)
   * this token is intended for.
   */
  aud: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * String representing the issuer of this token, as defined in JWT [RFC7519].
   */
  iss: z.string().optional(),

  /**
   * String identifier for the token, as defined in JWT [RFC7519].
   */
  jti: z.string().optional(),

  // You can add other custom claims that might be in your tokens
  // e.g., 'permissions', 'organization_id', etc.
  permissions: z.array(z.string()).optional(), // Example custom claim
  
  /**
   * User ID associated with this token.
   */
  user_id: z.string().optional(), // Custom claim for user identification
});

/**
 * Schema for the token introspection response when the token is inactive or invalid.
 * RFC 7662 Section 2.2
 */
export const introspectResponseInactiveSchema = z.object({
  /**
   * Boolean indicator of whether or not the presented token is currently active. (REQUIRED)
   * In this case, it is false.
   */
  active: z.literal(false),
});

/**
 * Combined schema for the token introspection response.
 */
export const introspectResponseSchema = z.union([
  introspectResponseActiveSchema,
  introspectResponseInactiveSchema,
]);

export type IntrospectResponseActive = z.infer<typeof introspectResponseActiveSchema>;
export type IntrospectResponseInactive = z.infer<typeof introspectResponseInactiveSchema>;
export type IntrospectResponse = z.infer<typeof introspectResponseSchema>;
