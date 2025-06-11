# Guidance for Implementing JWT Bearer Token Authentication in `withAuth` Middleware

This document outlines the necessary modifications for the `withAuth` middleware (or a new, similar middleware) to support JWT Bearer token authentication, primarily for Admin API Endpoints, with the goal of unifying authentication mechanisms.

**Target File (Conceptual):** This logic should be integrated into the existing `lib/auth/middleware.ts` or potentially a new JWT-specific middleware file if the complexity warrants separation.

## Core Logic to Incorporate/Verify:

1.  **Token Extraction:**
    *   The middleware must inspect the `Authorization` header of incoming requests.
    *   It should specifically look for a `Bearer` token (e.g., `Authorization: Bearer <token>`).
    *   If a Bearer token is present, extract the token string (the part after "Bearer ").
    *   **Decision Point:** If no Bearer token is found, the middleware should determine the course of action. For admin routes aiming for JWT-only authentication, this should result in a rejection (e.g., HTTP 401 Unauthorized). If a transition period supports both JWT and existing session cookies, that logic would apply here (though the primary goal is JWT unification).

2.  **JWT Library Selection and Usage:**
    *   A robust and well-maintained JWT library must be used. The `jose` library is recommended as per project documentation and its comprehensive feature set (including JWKS support).
    *   Example: `import * as jose from 'jose';`

3.  **Public Key Retrieval for Signature Verification (JWKS):**
    *   The middleware needs to verify the JWT's signature using the corresponding public key from the Authentication Server.
    *   **JWKS URI:** Fetch the public key(s) from the Authentication Server's JWKS (JSON Web Key Set) URI (e.g., `https://your-auth-server.com/.well-known/jwks.json`). This URI should be configurable.
    *   **JWKS Caching:** To optimize performance and avoid excessive requests to the auth server, the JWKS response *must* be cached. The `jose` library's `jose.createRemoteJWKSet()` function typically handles this by default (fetching on cache miss and respecting cache control headers from the JWKS endpoint).
    *   **Key Selection:** The JWT will contain a `kid` (Key ID) in its header. This `kid` must be used to select the correct public key from the JWKS for signature verification. `jose.jwtVerify` handles this automatically when provided with a `JWKS` object from `createRemoteJWKSet`.

4.  **JWT Verification and Validation:**
    *   Use the chosen library's verification function (e.g., `jose.jwtVerify(token, JWKS, options)`).
    *   **Signature Verification:** This is the primary step, ensuring the token was signed by the trusted Authentication Server.
    *   **Standard Claim Validation:** The verification process *must* also validate standard JWT claims:
        *   `issuer` (`iss`): Verify that the token was issued by the expected Authentication Server. This should be a configurable URI (e.g., `https://auth.yourdomain.com`).
        *   `audience` (`aud`): Verify that the token is intended for this API. This should be a configurable URI or an array of URIs (e.g., `https://api.yourdomain.com`).
        *   `expirationTime` (`exp`): Ensure the token has not expired.
        *   `notBefore` (`nbf`) (if present): Ensure the token is not being used before its designated active time.
    *   **Error Handling:** Implement robust error handling for all verification failures (e.g., `TokenExpiredError`, `JWTClaimValidationFailed`, `JWSSignatureVerificationFailed`, `JWKSMultipleMatchingKeys`, `JWKSNoMatchingKey`). These errors should typically result in an HTTP 401 Unauthorized response, possibly with a brief error message or code. Avoid leaking sensitive details in error messages.

5.  **Token Revocation Check (Optional but Recommended for Enhanced Security):**
    *   If a token revocation mechanism is in place (e.g., a blacklist of `jti` values in Redis or a database):
        *   After initial JWT validation, extract the `jti` (JWT ID) claim from the token payload.
        *   Check if this `jti` (or the token signature itself, though `jti` is more standard) exists in the revocation list.
        *   If revoked, the token must be treated as invalid, and the request rejected (HTTP 401 Unauthorized).

6.  **Populate `AuthContext`:**
    *   Upon successful JWT verification and validation (and if not revoked), the token's payload should be decoded.
    *   This payload is used to populate the `AuthContext` object for the current request.
    *   **User Identification:**
        *   `user_id`: Typically extracted from the `sub` (subject) claim.
    *   **Permissions/Scopes:**
        *   Extract permissions or scopes from claims like `scope` (standard, usually a space-separated string) or a custom `permissions` claim (often an array).
        *   These must be parsed into an array format suitable for `AuthContext.permissions` or `AuthContext.scopes`.
    *   **Other Information:**
        *   Store the full `tokenPayload` in the `AuthContext` for potential downstream use.
        *   Any other relevant user information present in the JWT (e.g., `username`, `email`) can also be added to the `AuthContext` if needed by the application logic.
    *   Example `AuthContext` structure:
        ```typescript
        interface AuthContext {
          user_id: string | null;
          tokenPayload?: jose.JWTPayload; // Store the decoded payload
          scopes?: string[];
          permissions?: string[];
          // ... other existing or new fields
        }
        ```

7.  **Integration with Existing Permission Enforcement:**
    *   The permission checking logic already present in `withAuth` (e.g., using `requiredPermissions` or a similar option) should seamlessly use the `permissions` or `scopes` array now populated in the `AuthContext` from the JWT.
    *   If there's a mapping required between scopes received in the JWT and internal application permissions, this mapping should occur before or during the population of `AuthContext.permissions`.

8.  **Transition Strategy (JWT-Only for Admin Routes):**
    *   For Admin API endpoints, the plan is to move towards JWT-only authentication.
    *   The middleware should be configured or designed such that if an admin route is accessed:
        *   It *requires* a valid Bearer token.
        *   It *does not* fall back to session cookie authentication.
        *   Failure to provide a valid Bearer token results in an HTTP 401 Unauthorized error.

## Conceptual Code Snippet (using `jose`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';
// Assuming AuthContext and withAuth options structure are defined elsewhere
// import { AuthContext, WithAuthOptions } from './authTypes';

// Configuration (ideally from environment variables or a config service)
const AUTH_SERVER_ISSUER_URI = process.env.AUTH_SERVER_ISSUER_URI; // e.g., 'https://auth.example.com'
const API_AUDIENCE_URI = process.env.API_AUDIENCE_URI;             // e.g., 'https://api.example.com/v1'
const JWKS_URI = new URL('/.well-known/jwks.json', AUTH_SERVER_ISSUER_URI);

// Create a remote JWK set instance. This object will cache JWKs.
const JWKS = jose.createRemoteJWKSet(JWKS_URI);

// This function would be part of or called by the modified withAuth
async function verifyJwtAndPopulateContext(request: NextRequest, context: Partial<AuthContext>): Promise<boolean | NextResponse > {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // For JWT-only routes, no token means unauthorized.
    // If supporting mixed mode, here you might check for a session cookie.
    return NextResponse.json({ error: 'Unauthorized: Missing Bearer token' }, { status: 401 });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    if (!AUTH_SERVER_ISSUER_URI || !API_AUDIENCE_URI) {
        console.error("JWT Auth: Issuer or Audience URI not configured.");
        return NextResponse.json({ error: 'Internal Server Configuration Error' }, { status: 500 });
    }

    const { payload, protectedHeader } = await jose.jwtVerify(token, JWKS, {
      issuer: AUTH_SERVER_ISSUER_URI,
      audience: API_AUDIENCE_URI,
    });

    // --- Token Revocation Check (Conceptual) ---
    // if (isTokenRevoked(payload.jti)) {
    //   return NextResponse.json({ error: 'Unauthorized: Token revoked' }, { status: 401 });
    // }
    // --- End Token Revocation Check ---

    context.user_id = payload.sub || null;
    context.tokenPayload = payload;
    // Assuming 'scope' claim contains space-separated scopes that map to permissions
    context.scopes = payload.scope ? (payload.scope as string).split(' ') : [];
    context.permissions = context.scopes; // Direct mapping or apply transformation

    return true; // Indicates successful JWT validation and context population

  } catch (err) {
    let errorMessage = 'Unauthorized';
    if (err instanceof jose.errors.JWTClaimValidationFailed) {
        errorMessage = `Unauthorized: JWT claim validation failed (${err.claim} ${err.reason})`;
    } else if (err instanceof jose.errors.JWSInvalid) {
        errorMessage = 'Unauthorized: Invalid JWS structure';
    } else if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
        errorMessage = 'Unauthorized: JWT signature verification failed';
    } else if (err instanceof jose.errors.TokenExpired) { // Not a direct jose error, but common from libraries
        errorMessage = 'Unauthorized: Token expired';
    } else if (err instanceof jose.errors.JWTExpired) { // Jose's specific error for expired token
        errorMessage = `Unauthorized: Token expired at ${new Date(payload.exp * 1000).toISOString()}`;
    }
    // Add more specific error handling as needed from 'jose' library errors

    console.error("JWT validation error:", err.message, err.code || '');
    return NextResponse.json({ error: errorMessage, details: err.message }, { status: 401 });
  }
}

// Example of how it might be integrated into withAuth:
//
// export function withAuth(handler, options: WithAuthOptions) {
//   return async (request: NextRequest, params) => {
//     const authContext: Partial<AuthContext> = {};
//
//     if (options.authenticationStrategy === 'jwt' || options.isUserRouteRequiringJWT) { // Example condition
//       const jwtResult = await verifyJwtAndPopulateContext(request, authContext);
//       if (jwtResult instanceof NextResponse) {
//         return jwtResult; // Return error response
//       }
//     } else {
//       // ... existing session-based logic ...
//     }
//
//     // ... existing permission checking logic using authContext.permissions ...
//     // if (!hasRequiredPermissions(authContext.permissions, options.requiredPermissions)) {
//     //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//     // }
//
//     return handler(request, authContext as AuthContext, params);
//   };
// }
```

## Summary of Changes to `withAuth` (or new middleware):

*   **Add JWT processing path:** Conditionally execute JWT validation if the route is designated for JWT auth.
*   **Configuration:** Ensure issuer, audience, and JWKS URI are configurable.
*   **AuthContext Enrichment:** The `AuthContext` must be populated with `user_id`, `permissions`/`scopes`, and the full `tokenPayload` from the JWT.
*   **Error Handling:** Standardize HTTP 401 responses for JWT failures.
*   **Documentation:** Update any documentation related to authentication to reflect the new JWT Bearer token mechanism.

This detailed guidance should provide a solid foundation for the developer tasked with implementing these changes.
