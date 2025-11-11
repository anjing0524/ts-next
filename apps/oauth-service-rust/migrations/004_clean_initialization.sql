-- Clean database initialization for E2E testing
-- This script ensures all required data exists without conflicts

-- Create admin user if it doesn't exist
INSERT OR IGNORE INTO users (
    id, username, password_hash, is_active, created_at, updated_at,
    display_name, first_name, last_name, must_change_password
) VALUES (
    'user-admin-001',
    'admin',
    '$2b$12$YvvLFd.jEPSIpd3f1sWFpuJTCiJhMkHUqEGpKxp5Gkk5ooVEFUNBW', -- password: admin123
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Admin User',
    'Admin',
    'User',
    0
);

-- Create admin portal OAuth client if it doesn't exist
INSERT OR IGNORE INTO oauth_clients (
    id,
    client_id,
    client_secret,
    name,
    description,
    client_type,
    token_endpoint_auth_method,
    require_pkce,
    require_consent,
    is_active,
    created_at,
    updated_at,
    access_token_ttl,
    refresh_token_ttl,
    authorization_code_lifetime,
    strict_redirect_uri_matching,
    allow_localhost_redirect,
    require_https_redirect
) VALUES (
    'client-admin-portal-001',
    'auth-center-admin-client',
    '$2b$10$PKrWTcyzYWIf2c38GCQ3b.QvuMjGGXcyAp.juw0Fz1EoZ80HQ.4.C',
    'Admin Portal',
    'Admin Portal OAuth 2.1 Third-Party Client',
    'CONFIDENTIAL',
    'client_secret_basic',
    1,
    1,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    3600,
    604800,
    600,
    1,
    1,
    0
);

-- Add redirect URI for admin portal if it doesn't exist
INSERT OR IGNORE INTO client_redirect_uris (client_id, uri)
SELECT id, 'http://localhost:6188/auth/callback' FROM oauth_clients
WHERE client_id = 'auth-center-admin-client';

-- Add grant types for admin portal if they don't exist
INSERT OR IGNORE INTO client_grant_types (client_id, grant_type)
SELECT id, 'authorization_code' FROM oauth_clients
WHERE client_id = 'auth-center-admin-client'
UNION ALL
SELECT id, 'refresh_token' FROM oauth_clients
WHERE client_id = 'auth-center-admin-client';

-- Add response types for admin portal if they don't exist
INSERT OR IGNORE INTO client_response_types (client_id, response_type)
SELECT id, 'code' FROM oauth_clients
WHERE client_id = 'auth-center-admin-client';

-- Add scopes for admin portal if they don't exist
INSERT OR IGNORE INTO client_allowed_scopes (client_id, scope)
SELECT id, scope FROM (
    SELECT 'openid' AS scope
    UNION ALL SELECT 'profile'
    UNION ALL SELECT 'email'
) AS scopes, oauth_clients
WHERE oauth_clients.client_id = 'auth-center-admin-client';
