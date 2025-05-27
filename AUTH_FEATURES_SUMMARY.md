## Authentication & Authorization Enhancements

This document summarizes the recent improvements to the application's authentication and authorization mechanisms.

### 1. Next.js Middleware for Authentication & Authorization

*   **Location:** `app/middleware.ts`
*   **Purpose:** This middleware acts as the primary gatekeeper for protected application routes. It validates JSON Web Tokens (JWTs) to authenticate users and then checks their permissions to authorize access to specific pages.
*   **Functionality:**
    *   **Route Protection:** Secures specified routes (e.g., `/dashboard`, `/flow`).
    *   **JWT Validation:** Extracts JWTs from either an `auth_token` cookie or an `Authorization: Bearer <token>` header. It validates the token's signature, expiry, issuer, and audience against configured environment variables.
    *   **Unauthenticated Redirect:** If a token is missing, invalid, or expired, the user is redirected to the `/login` page. A `redirect_uri` query parameter is appended to facilitate returning the user to their originally requested page after successful login.
    *   **Page-Level Permission Checks:**
        *   After successful JWT validation, the middleware inspects the `permissions` array within the JWT payload.
        *   It checks for specific permission strings (e.g., `page_dashboard:access`, `page_flow:access`) required to access the requested page, based on a predefined mapping in the middleware.
    *   **Unauthorized Redirect:** If the validated JWT does not contain the necessary permission for the requested route, the user is redirected to the `/unauthorized` page.

### 2. PKCE (Proof Key for Code Exchange) Support

*   **Endpoint:** `/api/oauth/token`
*   **Enhancement:** The OAuth 2.0 token endpoint now implements PKCE (RFC 7636).
*   **Benefit:** This significantly enhances the security of the authorization code grant flow, especially for public clients (like mobile or single-page applications), by mitigating authorization code interception attacks. The `/authorize` endpoint was already equipped to handle and store PKCE challenge parameters.

### 3. Page-Level Permissions Strategy

*   **Concept:** Access to specific pages or application areas is governed by a granular permission system.
*   **Implementation:**
    *   **Resources & Permissions:** The strategy involves defining resources that correspond to pages or page groups (e.g., a `Resource` named `page_dashboard`). These are paired with generic permissions like `access` (e.g., a `Permission` named `access`).
    *   **JWT Claim:** The resulting permissions for a user are included in their JWT as an array of strings in the `permissions` claim (e.g., `["page_dashboard:access", "page_settings_account:access"]`).
    *   **Enforcement:** The `app/middleware.ts` leverages this `permissions` claim to make authorization decisions for page access.

### 4. New `/unauthorized` Page

*   **Route:** `/unauthorized`
*   **Purpose:** Provides a dedicated, user-friendly page when a user attempts to access a resource or page for which they do not have sufficient permissions.
*   **Features:**
    *   Displays a clear "Unauthorized Access" message.
    *   Can show context-specific information based on query parameters passed from the middleware, such as the path they attempted to access (`attempted_path`) and the permission that was required (`required_permission` or `error` type).
    *   Offers navigation links (e.g., to the homepage or login page).

### 5. Standardized Logging

*   **Location:** `app/middleware.ts` (and other OAuth components)
*   **Improvement:** All `console.*` calls within the authentication and authorization middleware have been replaced with the centralized logging utility found at `utils/logger.ts`.
*   **Benefits:** This ensures consistent log formatting, appropriate log levels (info, debug, warn, error), and enables configured log transports (e.g., console, daily rotated files), improving traceability and debugging capabilities for authentication and authorization events.

This set of features strengthens the application's security posture, provides a better user experience around access control, and improves maintainability through standardized logging.
