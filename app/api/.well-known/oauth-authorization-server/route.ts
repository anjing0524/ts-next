// 文件路径: app/api/.well-known/oauth-authorization-server/route.ts
// 描述: OAuth 2.0 Authorization Server Metadata (RFC 8414)
//       OpenID Connect Discovery 1.0 incorporates and extends this.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/errorHandler'; // 基本错误处理

// 辅助函数获取基础URL (应与JWTUtils.getIssuer等配置一致)
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

/**
 * @swagger
 * /.well-known/oauth-authorization-server:
 *   get:
 *     summary: OAuth 2.0 Authorization Server Metadata
 *     description: |
 *       Provides metadata about the OAuth 2.0 authorization server,
 *       such as its authorization, token, introspection, and revocation endpoints.
 *       This endpoint is typically used by clients for dynamic discovery.
 *       Refer to RFC 8414 and OpenID Connect Discovery 1.0.
 *     tags:
 *       - OAuth V2 (Discovery)
 *     produces:
 *       - application/json
 *     responses:
 *       '200':
 *         description: Successfully returns the authorization server metadata.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                   description: The authorization server's issuer identifier URL.
 *                   example: "https://example.com"
 *                 authorization_endpoint:
 *                   type: string
 *                   format: url
 *                   description: URL of the authorization endpoint.
 *                   example: "https://example.com/api/v2/oauth/authorize"
 *                 token_endpoint:
 *                   type: string
 *                   format: url
 *                   description: URL of the token endpoint.
 *                   example: "https://example.com/api/v2/oauth/token"
 *                 introspection_endpoint:
 *                   type: string
 *                   format: url
 *                   description: URL of the token introspection endpoint (RFC 7662).
 *                   example: "https://example.com/api/v2/oauth/introspect"
 *                 revocation_endpoint:
 *                   type: string
 *                   format: url
 *                   description: URL of the token revocation endpoint (RFC 7009).
 *                   example: "https://example.com/api/v2/oauth/revoke"
 *                 userinfo_endpoint:
 *                   type: string
 *                   format: url
 *                   description: URL of the UserInfo endpoint (OIDC).
 *                   example: "https://example.com/api/v2/oauth/userinfo"
 *                 jwks_uri:
 *                   type: string
 *                   format: url
 *                   description: URL of the server's JSON Web Key Set (JWKS) document (RFC 7517).
 *                   example: "https://example.com/api/.well-known/jwks.json" # 注意：/api 前缀
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of OAuth scopes that this server supports.
 *                   example: ["openid", "profile", "email", "offline_access", "api:read", "api:write"]
 *                 response_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of response_type values that this server supports.
 *                   example: ["code", "token", "id_token", "code id_token"]
 *                 grant_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of grant types that this server supports.
 *                   example: ["authorization_code", "client_credentials", "refresh_token", "password"]
 *                 token_endpoint_auth_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of client authentication methods supported by the token endpoint.
 *                   example: ["client_secret_basic", "client_secret_post", "private_key_jwt"]
 *                 code_challenge_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: PKCE code challenge methods supported.
 *                   example: ["S256", "plain"]
 *                 # --- OIDC Specific (if supporting OIDC Discovery) ---
 *                 subject_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of subject identifier types supported (e.g., "public", "pairwise").
 *                   example: ["public"]
 *                 id_token_signing_alg_values_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of JWS signing algorithms (alg values) supported for the ID Token.
 *                   example: ["RS256", "ES256"]
 *                 # ... other OIDC discovery parameters
 *       '500':
 *         description: Server configuration error.
 */
async function discoveryHandler(request: NextRequest) {
  const baseUrl = getBaseUrl(request); // Or use a configured environment variable for issuer

  // TODO: 这些值很多应该从配置或环境变量中读取，而不是硬编码。
  const metadata = {
    issuer: process.env.JWT_ISSUER || baseUrl, // 必须与JWT中的iss声明匹配
    authorization_endpoint: `${baseUrl}/api/v2/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/v2/oauth/token`,
    introspection_endpoint: `${baseUrl}/api/v2/oauth/introspect`,
    revocation_endpoint: `${baseUrl}/api/v2/oauth/revoke`,
    userinfo_endpoint: `${baseUrl}/api/v2/oauth/userinfo`, // OIDC
    jwks_uri: `${baseUrl}/api/v2/.well-known/jwks.json`, // OIDC - 确保此端点存在

    // 示例值 - 应从实际配置中获取
    scopes_supported: [
      "openid", // OIDC: 必须
      "profile", // OIDC: 推荐
      "email", // OIDC: 推荐
      "address", // OIDC: 可选
      "phone", // OIDC: 可选
      "offline_access", // 请求刷新令牌
      // 自定义API作用域
      "api:read",
      "api:write",
      "user:profile:read",
      "user:profile:write",
      "permissions.verify", // 之前定义的权限
      "permissions.batchVerify"
    ],
    response_types_supported: [
      "code", // Authorization Code Flow
      // "token", // Implicit Flow (不推荐用于新的应用)
      // "id_token", // OIDC Implicit
      // "code id_token", // OIDC Hybrid
      // "code token", // OIDC Hybrid
      // "code id_token token" // OIDC Hybrid
    ],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      // "password", // Resource Owner Password Credentials Grant (不推荐)
      // "urn:ietf:params:oauth:grant-type:jwt-bearer" // JWT Bearer Grant (RFC 7523)
      // "urn:ietf:params:oauth:grant-type:saml2-bearer" // SAML 2.0 Bearer Assertion Grant (RFC 7522)
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic", // HTTP Basic
      "client_secret_post",  // client_id & client_secret in body
      // "private_key_jwt",     // Client Assertion with JWT (RFC 7523)
      // "none"                 // For public clients
    ],
    revocation_endpoint_auth_methods_supported: [ // RFC 7009, Section 3
      "client_secret_basic",
      "client_secret_post",
      // "private_key_jwt",
      // "none" // If public clients are allowed to revoke their own tokens
    ],
    introspection_endpoint_auth_methods_supported: [ // RFC 7662, Section 4
      "client_secret_basic",
      "client_secret_post",
      // "private_key_jwt",
    ],
    code_challenge_methods_supported: ["S256"], // PKCE (RFC 7636) - S256 is REQUIRED by OAuth 2.1

    // --- OIDC Specific (if fully supporting OIDC Discovery) ---
    // Check OpenID Connect Discovery 1.0 spec for more fields
    subject_types_supported: ["public"], // "public" or "pairwise"
    id_token_signing_alg_values_supported: process.env.JWT_ALGORITHM ? [process.env.JWT_ALGORITHM] : ["RS256"], // e.g. ["RS256", "ES256"]
    // userinfo_signing_alg_values_supported: [], // If UserInfo response can be signed
    // request_object_signing_alg_values_supported: [], // If support signed request objects
    // display_values_supported: ["page", "popup"],
    // claim_types_supported: ["normal"],
    claims_supported: [ // Claims that can be returned from UserInfo endpoint or in ID Token
        "sub", "iss", "aud", "exp", "iat", "jti",
        "name", "given_name", "family_name", "preferred_username", "email", "picture", "updated_at"
        // "email_verified", "phone_number", "phone_number_verified", "address"
    ],
    // service_documentation: `${baseUrl}/docs/oauth`,
    // ui_locales_supported: ["en-US", "zh-CN"],
    // claims_parameter_supported: false,
    // request_parameter_supported: false, // If support request parameter
    // request_uri_parameter_supported: true, // If support request_uri parameter
  };

  // 根据服务器实际支持的功能调整上述列表
  // 例如，如果不支持 implicit flow，就从 response_types_supported 中移除 "token" 和 "id_token"

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Add CORS headers if this endpoint is public and needs to be accessed cross-origin
      // 'Access-Control-Allow-Origin': '*',
    },
  });
}

export const GET = withErrorHandler(discoveryHandler);

EOF
