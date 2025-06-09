import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const protocol = request.headers.get('x-forwarded-proto') || requestUrl.protocol.slice(0, -1);
  const host = request.headers.get('x-forwarded-host') || requestUrl.host;
  const baseUrl = `${protocol}://${host}`;

  const discoveryDocument = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    jwks_uri: `${baseUrl}/api/.well-known/jwks.json`,
    
    // Supported response types
    response_types_supported: ['code'],
    
    // Supported grant types
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'client_credentials',
    ],
    
    // Supported subject identifier types
    subject_types_supported: ['public'],
    
    // Supported ID token signing algorithms
    id_token_signing_alg_values_supported: ['HS256'],
    
    // Supported scopes
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'offline_access',
    ],
    
    // Supported claims
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'email',
      'email_verified',
      'name',
      'preferred_username',
      'updated_at',
    ],
    
    // Supported token endpoint authentication methods
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'none', // For public clients
    ],
    
    // Supported token endpoint authentication signing algorithms
    token_endpoint_auth_signing_alg_values_supported: [
      'RS256',
      'ES256',
      'PS256',
    ],
    
    // PKCE support
    code_challenge_methods_supported: ['S256'],
    
    // Revocation endpoint authentication methods
    revocation_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt',
      'none',
    ],
    
    // Additional claims
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: false,
    
    // Service documentation
    service_documentation: `${baseUrl}/docs/oauth2`,
    op_policy_uri: `${baseUrl}/policies/privacy`,
    op_tos_uri: `${baseUrl}/policies/terms`,
  };

  return NextResponse.json(discoveryDocument, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
} 