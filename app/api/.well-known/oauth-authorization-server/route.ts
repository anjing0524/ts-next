// 文件路径: app/api/.well-known/oauth-authorization-server/route.ts
// 描述: OAuth 2.0 Authorization Server Metadata (RFC 8414)
//       OpenID Connect Discovery 1.0 incorporates and extends this.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/errorHandler'; // 基本错误处理

// 辅助函数获取基础URL
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

/**
 * @swagger
 * /.well-known/oauth-authorization-server:
 *   get:
 *     summary: OAuth 2.0 Authorization Server Metadata (RFC 8414) & OpenID Connect Discovery 1.0
 *     description: |
 *       Provides configuration information about the OAuth 2.0 authorization server and OpenID Provider.
 *       Clients use this metadata to configure their interaction with the server.
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
 *                 issuer: { type: string, description: "发行者标识URL (Issuer Identifier URL)", example: "https://example.com" }
 *                 authorization_endpoint: { type: string, format: url, description: "授权端点URL (Authorization Endpoint URL)", example: "https://example.com/api/v2/oauth/authorize" }
 *                 token_endpoint: { type: string, format: url, description: "令牌端点URL (Token Endpoint URL)", example: "https://example.com/api/v2/oauth/token" }
 *                 introspection_endpoint: { type: string, format: url, description: "令牌自省端点URL (Token Introspection Endpoint URL - RFC 7662)", example: "https://example.com/api/v2/oauth/introspect" }
 *                 revocation_endpoint: { type: string, format: url, description: "令牌撤销端点URL (Token Revocation Endpoint URL - RFC 7009)", example: "https://example.com/api/v2/oauth/revoke" }
 *                 userinfo_endpoint: { type: string, format: url, description: "UserInfo端点URL (OIDC UserInfo Endpoint URL)", example: "https://example.com/api/v2/oauth/userinfo" }
 *                 jwks_uri: { type: string, format: url, description: "JWKS文档URL (JSON Web Key Set Document URL - RFC 7517)", example: "https://example.com/api/v2/.well-known/jwks.json" }
 *                 scopes_supported: { type: array, items: { type: string }, description: "支持的OAuth范围 (Supported OAuth Scopes)", example: ["openid", "profile", "email", "offline_access", "api:read", "api:write"] }
 *                 response_types_supported: { type: array, items: { type: string }, description: "支持的response_type值 (Supported response_type values)", example: ["code"] }
 *                 grant_types_supported: { type: array, items: { type: string }, description: "支持的授权类型 (Supported Grant Types)", example: ["authorization_code", "refresh_token", "client_credentials"] }
 *                 token_endpoint_auth_methods_supported: { type: array, items: { type: string }, description: "令牌端点支持的客户端认证方法 (Supported Client Authentication Methods for Token Endpoint)", example: ["client_secret_basic", "client_secret_post"] }
 *                 revocation_endpoint_auth_methods_supported: { type: array, items: { type: string }, description: "撤销端点支持的客户端认证方法 (Supported Client Authentication Methods for Revocation Endpoint)", example: ["client_secret_basic", "client_secret_post"] }
 *                 introspection_endpoint_auth_methods_supported: { type: array, items: { type: string }, description: "自省端点支持的资源服务器认证方法 (Supported Resource Server Authentication Methods for Introspection Endpoint)", example: ["client_secret_basic", "client_secret_post"] } # Note: Introspection often uses Bearer token for RS auth
 *                 code_challenge_methods_supported: { type: array, items: { type: string }, description: "PKCE代码挑战方法 (PKCE Code Challenge Methods)", example: ["S256"] }
 *                 subject_types_supported: { type: array, items: { type: string }, description: "支持的主体标识类型 (Supported Subject Identifier Types - OIDC)", example: ["public"] }
 *                 id_token_signing_alg_values_supported: { type: array, items: { type: string }, description: "ID令牌支持的JWS签名算法 (Supported JWS Signing Algorithms for ID Token - OIDC)", example: ["RS256"] }
 *                 claims_supported: { type: array, items: { type: string }, description: "支持的用户声明 (Supported User Claims - OIDC)", example: ["sub", "iss", "aud", "exp", "iat", "name", "email"] }
 *       '500':
 *         description: 服务器配置错误 (Server configuration error).
 */
async function discoveryHandler(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const issuerIdentifier = process.env.JWT_ISSUER || baseUrl; // 必须与JWT中的iss声明匹配 (Must match 'iss' claim in JWTs)

  const metadata = {
    // RFC 8414: OAuth 2.0 Authorization Server Metadata
    issuer: issuerIdentifier, // 发行者标识URL
    authorization_endpoint: `${baseUrl}/api/v2/oauth/authorize`, // 授权端点URL
    token_endpoint: `${baseUrl}/api/v2/oauth/token`,             // 令牌端点URL
    introspection_endpoint: `${baseUrl}/api/v2/oauth/introspect`,// 令牌自省端点URL (RFC 7662)
    revocation_endpoint: `${baseUrl}/api/v2/oauth/revoke`,       // 令牌撤销端点URL (RFC 7009)

    // RFC 7517: JSON Web Key Set
    jwks_uri: `${baseUrl}/api/v2/.well-known/jwks.json`, // JWKS文档URL (RFC 7517)

    // RFC 8414 Section 2 & OIDC Discovery 1.0 Section 3
    scopes_supported: [ // 支持的OAuth范围
      "openid",         // OIDC: 必须, 用于身份认证 (OIDC: REQUIRED, for identity authentication)
      "profile",        // OIDC: 可选, 请求用户的基本资料信息 (OIDC: OPTIONAL, requests user's default profile claims)
      "email",          // OIDC: 可选, 请求用户的邮箱地址 (OIDC: OPTIONAL, requests user's email address)
      "offline_access", // OAuth 2.0: 可选, 请求刷新令牌 (OAuth 2.0: OPTIONAL, requests a refresh token)
      "api:read",       // 示例API读取权限 (Example API read permission)
      "api:write",      // 示例API写入权限 (Example API write permission)
      "user:read",      // 示例用户读取权限 (Example user read permission)
      "user:write",     // 示例用户写入权限 (Example user write permission)
    ],
    response_types_supported: [ // 支持的response_type值
      "code",             // OAuth 2.0: 授权码模式 (OAuth 2.0: Authorization Code Flow)
    ],
    grant_types_supported: [ // 支持的授权类型
      "authorization_code", // OAuth 2.0: 授权码模式 (OAuth 2.0: Authorization Code Grant)
      "refresh_token",      // OAuth 2.0: 刷新令牌 (OAuth 2.0: Refresh Token Grant)
      "client_credentials", // OAuth 2.0: 客户端凭据模式 (OAuth 2.0: Client Credentials Grant)
    ],
    token_endpoint_auth_methods_supported: [ // 令牌端点支持的客户端认证方法
      "client_secret_basic", // RFC 6749: HTTP Basic (HTTP Basic Authentication)
      "client_secret_post",  // RFC 6749: client_id 和 client_secret 在请求体中 (client_id and client_secret in request body)
    ],
    revocation_endpoint_auth_methods_supported: [ // 撤销端点支持的客户端认证方法 (RFC 7009)
      "client_secret_basic",
      "client_secret_post",
    ],
    introspection_endpoint_auth_methods_supported: [ // 自省端点支持的认证方法 (RFC 7662)
      // Typically Resource Servers use Bearer tokens for introspection endpoint if it's protected by itself as a resource.
      // If the introspection endpoint requires client authentication (the client introspecting its own tokens, or a special RS client),
      // then methods like client_secret_basic/post could be listed.
      // For now, assuming it's protected and requires client credentials for the RS.
       "client_secret_basic",
       "client_secret_post",
       // "bearer_token" // Custom or if RS is a confidential client with its own credentials for introspection
    ],
    code_challenge_methods_supported: ["S256"], // PKCE代码挑战方法 (RFC 7636) - S256 is REQUIRED by OAuth 2.1

    // OpenID Connect Discovery 1.0 specific metadata
    userinfo_endpoint: `${baseUrl}/api/v2/oauth/userinfo`, // UserInfo端点URL (OIDC)
    subject_types_supported: ["public"], // 支持的主体标识类型 (e.g., "public", "pairwise")
    id_token_signing_alg_values_supported: process.env.JWT_ALGORITHM ? [process.env.JWT_ALGORITHM as string] : ["RS256"], // ID令牌支持的JWS签名算法

    claims_supported: [ // UserInfo端点或ID令牌中可能返回的声明 (Claims that can be returned from UserInfo or in ID Token)
        "sub", "iss", "aud", "exp", "iat", "jti", // Standard JWT claims
        "name", "given_name", "family_name", "preferred_username", "email", "picture", "updated_at", // Standard OIDC profile/email claims
        // "email_verified", "phone_number", "phone_number_verified" // Include if supported and fields exist
    ],
    // 以下是一些其他常见的OIDC元数据字段，根据实际支持情况添加
    // (Below are some other common OIDC metadata fields, add based on actual support)
    // request_object_signing_alg_values_supported: ["RS256", "ES256"],
    // userinfo_signing_alg_values_supported: ["RS256"], // If UserInfo response can be signed
    // token_endpoint_auth_signing_alg_values_supported: ["RS256"], // For private_key_jwt
    // display_values_supported: ["page", "popup"],
    // claim_types_supported: ["normal"],
    // claims_parameter_supported: false, // Whether the "claims" request parameter is supported
    // request_parameter_supported: true, // Whether the "request" request parameter is supported
    // request_uri_parameter_supported: true, // Whether the "request_uri" request parameter is supported
    // service_documentation: `${baseUrl}/docs/oauth`,
    // ui_locales_supported: ["en-US", "zh-CN"],
  };

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Consider adding CORS headers if this endpoint needs to be accessed cross-origin by browsers
      // 'Access-Control-Allow-Origin': '*',
    },
  });
}

export const GET = withErrorHandler(discoveryHandler);
