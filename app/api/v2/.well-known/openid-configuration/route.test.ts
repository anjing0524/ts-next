// app/api/v2/.well-known/openid-configuration/route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { GET } from './route'; // Adjust path based on your actual file structure
import { NextRequest } from 'next/server';

const MOCK_BASE_URL = 'https://testauth.example.com';
const MOCK_ISSUER = process.env.JWT_ISSUER || MOCK_BASE_URL;
const MOCK_JWT_ALGORITHM = 'RS256';

describe('/api/v2/.well-known/openid-configuration Endpoint', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.JWT_ISSUER = MOCK_ISSUER;
    process.env.JWT_ALGORITHM = MOCK_JWT_ALGORITHM;
    // Other env vars used by the endpoint if any (e.g. for constructing URLs, though it seems to use getBaseUrl)
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return a valid OpenID configuration JSON structure', async () => {
    // Mock NextRequest with a base URL
    const req = new NextRequest(`${MOCK_BASE_URL}/api/v2/.well-known/openid-configuration`);
    const response = await GET(req); // Pass the mocked request

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const config = await response.json();

    // Check for essential OIDC discovery fields
    expect(config.issuer).toBe(MOCK_ISSUER);
    expect(config.authorization_endpoint).toBe(`${MOCK_BASE_URL}/api/v2/oauth/authorize`);
    expect(config.token_endpoint).toBe(`${MOCK_BASE_URL}/api/v2/oauth/token`);
    expect(config.jwks_uri).toBe(`${MOCK_BASE_URL}/api/v2/.well-known/jwks.json`);
    expect(config.userinfo_endpoint).toBe(`${MOCK_BASE_URL}/api/v2/oauth/userinfo`);
    expect(config.introspection_endpoint).toBe(`${MOCK_BASE_URL}/api/v2/oauth/introspect`);
    expect(config.revocation_endpoint).toBe(`${MOCK_BASE_URL}/api/v2/oauth/revoke`);

    expect(config.scopes_supported).toBeInstanceOf(Array);
    expect(config.scopes_supported).toContain('openid');
    expect(config.scopes_supported).toContain('profile');
    expect(config.scopes_supported).toContain('email');
    expect(config.scopes_supported).toContain('offline_access');

    expect(config.response_types_supported).toEqual(['code']);
    expect(config.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token', 'client_credentials']));

    expect(config.token_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(['client_secret_basic', 'client_secret_post']));
    expect(config.revocation_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(['client_secret_basic', 'client_secret_post']));
    // Introspection auth methods might vary, check if it's present
    expect(config.introspection_endpoint_auth_methods_supported).toBeInstanceOf(Array);


    expect(config.code_challenge_methods_supported).toEqual(['S256']);
    expect(config.subject_types_supported).toEqual(['public']);
    expect(config.id_token_signing_alg_values_supported).toEqual([MOCK_JWT_ALGORITHM]);

    expect(config.claims_supported).toBeInstanceOf(Array);
    expect(config.claims_supported).toContain('sub');
    expect(config.claims_supported).toContain('email');
    expect(config.claims_supported).toContain('name');
  });

  it('should use JWT_ISSUER from env if available, otherwise derive from request', async () => {
    const customIssuer = "https://custom.issuer.com";
    process.env.JWT_ISSUER = customIssuer;

    const req = new NextRequest(`${MOCK_BASE_URL}/api/v2/.well-known/openid-configuration`);
    const response = await GET(req);
    const config = await response.json();
    expect(config.issuer).toBe(customIssuer);

    // Reset for other tests if process.env is modified directly and not restored in afterEach
    delete process.env.JWT_ISSUER; // Or set back to MOCK_ISSUER for isolation
  });

  it('should derive issuer from request if JWT_ISSUER env is not set', async () => {
    // Ensure JWT_ISSUER is not set for this test case
    const tempOriginalIssuer = process.env.JWT_ISSUER;
    delete process.env.JWT_ISSUER;

    const req = new NextRequest(`${MOCK_BASE_URL}/api/v2/.well-known/openid-configuration`);
    const response = await GET(req);
    const config = await response.json();
    expect(config.issuer).toBe(MOCK_BASE_URL); // Should derive from the request's base URL

    // Restore if it was changed
    if (tempOriginalIssuer) process.env.JWT_ISSUER = tempOriginalIssuer; else delete process.env.JWT_ISSUER;
  });

});
