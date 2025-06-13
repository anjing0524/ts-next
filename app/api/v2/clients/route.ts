// 文件路径: app/api/v2/clients/route.ts
// 描述: 管理OAuth客户端 (创建和列表) (Manage OAuth Clients - Create and List)

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { OAuthClient, ClientType, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { JWTUtils } from '@/lib/auth/oauth2'; // For V2 Auth session token verification
// isValidEmail is not directly needed here, but a URL validator is.
// For simplicity, a basic URL validator will be included.

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const CLIENT_ID_LENGTH_BYTES = 16; // Bytes, will be hex encoded to 32 chars
const CLIENT_SECRET_LENGTH_BYTES = 32; // Bytes, will be base64url encoded to ~43 chars

// --- 辅助函数 ---
function errorResponse(message: string, status: number, errorCode?: string, details?: any) {
  return NextResponse.json({ error: errorCode || 'request_failed', message, details }, { status });
}

async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: Implement real RBAC check.
  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } }
  });
  return userWithRoles?.userRoles.some(ur => ur.role.name === 'admin') || false;
}

// 基本的URL验证 (Basic URL validation)
function isValidHttpUrl(str: string, allowHttpLocalhost: boolean = true): boolean {
  if (!str) return false;
  try {
    const url = new URL(str);
    if (allowHttpLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) { // Added IPv6 localhost
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// 从OAuthClient对象中排除敏感字段 (Exclude sensitive fields from OAuthClient object)
// 并将JSON字符串字段转换为数组 (And convert JSON string fields to arrays)
function sanitizeClientForResponse(client: OAuthClient | Partial<OAuthClient>): Partial<OAuthClient> {
  const { clientSecret, ...rest } = client as any; // clientSecret (hash) should not be returned in lists or GET by ID

  const output: Partial<OAuthClient> = { ...rest };

  const arrayFields: (keyof OAuthClient)[] = ['redirectUris', 'grantTypes', 'allowedScopes', 'responseTypes', 'ipWhitelist'];
  arrayFields.forEach(field => {
    if (rest[field] && typeof rest[field] === 'string') {
      try {
        output[field] = JSON.parse(rest[field] as string);
      } catch (e) {
        console.error(`Error parsing JSON string field '${field}' for client ID ${client.id}:`, e);
        // 根据策略，可以清除解析失败的字段或保留原始字符串 (Depending on policy, clear failed field or keep original string)
        // output[field] = []; // Or keep as is, or log error more formally
      }
    } else if (rest[field] === null && Array.isArray(output[field])) {
        // If the field was explicitly set to null (e.g. ipWhitelist), ensure it's null not an empty array from default parsing
        output[field] = null;
    }
  });
  return output;
}


// --- POST /api/v2/clients (管理员创建OAuth客户端) ---
export async function POST(req: NextRequest) {
  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  // 2. 解析请求体 (Parse request body)
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return errorResponse('Invalid JSON request body.', 400, 'invalid_request');
  }

  const {
    clientName, clientType, redirectUris, grantTypes, allowedScopes, responseTypes: reqResponseTypes,
    clientDescription, logoUri, policyUri, tosUri, jwksUri,
    tokenEndpointAuthMethod: rawTokenEndpointAuthMethod,
    requirePkce = true,
    requireConsent = true,
    ipWhitelist, // Expects array of strings
  } = requestBody;

  // 3. 输入数据验证 (Input data validation)
  if (!clientName || typeof clientName !== 'string' || clientName.trim() === '') return errorResponse('clientName is required and must be a non-empty string.', 400, 'validation_error_clientName');
  if (!clientType || !Object.values(ClientType).includes(clientType as ClientType)) return errorResponse(`clientType must be one of: ${Object.values(ClientType).join(', ')}.`, 400, 'validation_error_clientType');
  if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(uri => typeof uri === 'string' && isValidHttpUrl(uri))) {
    return errorResponse('redirectUris is required and must be a non-empty array of valid HTTPS URLs (HTTP for localhost is allowed).', 400, 'validation_error_redirectUris');
  }
  if (!grantTypes || !Array.isArray(grantTypes) || grantTypes.length === 0 || !grantTypes.every(gt => typeof gt === 'string')) {
    return errorResponse('grantTypes is required and must be a non-empty array of strings.', 400, 'validation_error_grantTypes');
  }
  // TODO: Validate grantTypes against a list of server-supported grant types.
  const supportedGrantTypes = ["authorization_code", "refresh_token", "client_credentials"];
  if (!grantTypes.every(gt => supportedGrantTypes.includes(gt))) {
      return errorResponse(`Unsupported grantType. Supported: ${supportedGrantTypes.join(', ')}`, 400, 'validation_error_unsupported_grantType');
  }

  if (!allowedScopes || !Array.isArray(allowedScopes) || !allowedScopes.every(s => typeof s === 'string')) {
    // allow empty array for allowedScopes
     if (allowedScopes !== undefined && !Array.isArray(allowedScopes)) return errorResponse('allowedScopes must be an array of strings if provided.', 400, 'validation_error_allowedScopes');
  }

  const finalResponseTypes = reqResponseTypes || (grantTypes.includes('authorization_code') ? ['code'] : []);
  if (!Array.isArray(finalResponseTypes) || !finalResponseTypes.every(rt => typeof rt === 'string')) { // Can be empty if no auth code grant
      return errorResponse('responseTypes must be an array of strings.', 400, 'validation_error_responseTypes');
  }
  if (grantTypes.includes('authorization_code') && finalResponseTypes.length === 0) {
      return errorResponse('responseTypes must include "code" if grantTypes includes "authorization_code".', 400, 'validation_error_responseTypes_for_code');
  }


  let tokenEndpointAuthMethod = rawTokenEndpointAuthMethod;
  if (!tokenEndpointAuthMethod) {
    if (clientType === ClientType.PUBLIC) tokenEndpointAuthMethod = 'none';
    else if (clientType === ClientType.CONFIDENTIAL) tokenEndpointAuthMethod = 'client_secret_basic';
  }
  const validAuthMethods = ["client_secret_basic", "client_secret_post", "private_key_jwt", "none"];
  if (!validAuthMethods.includes(tokenEndpointAuthMethod)) return errorResponse(`Invalid tokenEndpointAuthMethod. Supported: ${validAuthMethods.join(', ')}.`, 400, 'validation_error_authMethod');
  if (clientType === ClientType.PUBLIC && tokenEndpointAuthMethod !== 'none') return errorResponse('Public clients must use "none" for tokenEndpointAuthMethod.', 400, 'validation_error_public_auth');
  if (clientType === ClientType.CONFIDENTIAL && tokenEndpointAuthMethod === 'none') return errorResponse('Confidential clients must use an authentication method.', 400, 'validation_error_confidential_auth');
  if (tokenEndpointAuthMethod === 'private_key_jwt' && (!jwksUri || !isValidHttpUrl(jwksUri, false))) return errorResponse('A valid HTTPS jwksUri is required for private_key_jwt.', 400, 'validation_error_jwksUri');
  if (logoUri && !isValidHttpUrl(logoUri, false)) return errorResponse('logoUri must be a valid HTTPS URL.', 400, 'validation_error_logoUri');
  if (policyUri && !isValidHttpUrl(policyUri, false)) return errorResponse('policyUri must be a valid HTTPS URL.', 400, 'validation_error_policyUri');
  if (tosUri && !isValidHttpUrl(tosUri, false)) return errorResponse('tosUri must be a valid HTTPS URL.', 400, 'validation_error_tosUri');
  if (ipWhitelist && (!Array.isArray(ipWhitelist) || !ipWhitelist.every(ip => typeof ip === 'string'))) return errorResponse('ipWhitelist must be an array of strings if provided.', 400, 'validation_error_ipWhitelist');


  // 4. 生成 clientId 和 clientSecret (Generate clientId and clientSecret)
  const clientId = crypto.randomBytes(CLIENT_ID_LENGTH_BYTES).toString('hex');
  let clientSecretHash: string | null = null;
  let generatedRawSecret: string | null = null;

  if (clientType === ClientType.CONFIDENTIAL && (tokenEndpointAuthMethod === 'client_secret_basic' || tokenEndpointAuthMethod === 'client_secret_post')) {
    generatedRawSecret = crypto.randomBytes(CLIENT_SECRET_LENGTH_BYTES).toString('base64url');
    clientSecretHash = await bcrypt.hash(generatedRawSecret, 10);
  }

  try {
    const newClientData: Prisma.OAuthClientCreateInput = {
      clientId,
      clientSecret: clientSecretHash,
      clientName: clientName.trim(),
      clientType: clientType as ClientType,
      redirectUris: JSON.stringify(redirectUris),
      grantTypes: JSON.stringify(grantTypes),
      allowedScopes: JSON.stringify(allowedScopes || []), // Ensure it's an array string
      responseTypes: JSON.stringify(finalResponseTypes),
      clientDescription: clientDescription || null,
      logoUri: logoUri || null,
      policyUri: policyUri || null,
      tosUri: tosUri || null,
      jwksUri: jwksUri || null,
      tokenEndpointAuthMethod,
      requirePkce: Boolean(requirePkce),
      requireConsent: Boolean(requireConsent),
      ipWhitelist: ipWhitelist ? JSON.stringify(ipWhitelist) : null,
      isActive: true,
    };

    const newClient = await prisma.oAuthClient.create({ data: newClientData });

    const responseClientData = sanitizeClientForResponse(newClient);
    if (generatedRawSecret) {
      (responseClientData as any).clientSecret = generatedRawSecret;
    }

    return NextResponse.json(responseClientData, { status: 201 });

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('Failed to create client due to a conflict (e.g., generated clientId was not unique). Please try again.', 409, 'conflict_clientId');
    }
    console.error(`Admin client creation error by ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred during client creation.', 500, 'server_error');
  }
}


// --- GET /api/v2/clients (管理员获取OAuth客户端列表) ---
export async function GET(req: NextRequest) {
  // 1. 管理员认证 (Admin Authentication)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return errorResponse('Unauthorized: Missing Authorization header.', 401, 'unauthorized');
  const token = authHeader.substring(7);
  if (!token) return errorResponse('Unauthorized: Missing token.', 401, 'unauthorized');

  const { valid, payload, error: tokenError } = await JWTUtils.verifyV2AuthAccessToken(token);
  if (!valid || !payload) return errorResponse(`Unauthorized: Invalid token. ${tokenError || ''}`.trim(), 401, 'invalid_token');
  const adminUserId = payload.userId as string | undefined;
  if (!adminUserId) return errorResponse('Unauthorized: Invalid token payload (Admin ID missing).', 401, 'invalid_token_payload');
  if (!(await isUserAdmin(adminUserId))) return errorResponse('Forbidden: Not an admin.', 403, 'forbidden');

  // 2. 处理查询参数 (Process query parameters)
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10)); // page must be >= 1
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
  if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  const clientNameQuery = searchParams.get('clientName');
  const clientIdQuery = searchParams.get('clientId'); // The string client_id, not the CUID PK
  const clientTypeQuery = searchParams.get('clientType') as ClientType | null;

  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrderInput = searchParams.get('sortOrder') || 'desc';
  const sortOrder = (sortOrderInput.toLowerCase() === 'asc' || sortOrderInput.toLowerCase() === 'desc') ? sortOrderInput.toLowerCase() as Prisma.SortOrder : 'desc';

  const where: Prisma.OAuthClientWhereInput = {};
  if (clientNameQuery) where.clientName = { contains: clientNameQuery, mode: 'insensitive' };
  if (clientIdQuery) where.clientId = { contains: clientIdQuery }; // clientId is unique, but using contains for partial search by admin
  if (clientTypeQuery && Object.values(ClientType).includes(clientTypeQuery)) {
    where.clientType = clientTypeQuery;
  }

  const validSortByFields: (keyof OAuthClient)[] = ['clientName', 'clientId', 'clientType', 'createdAt', 'updatedAt', 'isActive'];
  const safeSortBy = validSortByFields.includes(sortBy as keyof OAuthClient) ? sortBy : 'createdAt';
  const orderBy: Prisma.OAuthClientOrderByWithRelationInput = { [safeSortBy]: sortOrder };

  try {
    const clients = await prisma.oAuthClient.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const totalClients = await prisma.oAuthClient.count({ where });

    return NextResponse.json({
      clients: clients.map(sanitizeClientForResponse),
      total: totalClients,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(totalClients / pageSize),
    }, { status: 200 });

  } catch (error: any) {
    console.error(`Admin client listing error by ${adminUserId}:`, error);
    return errorResponse('An unexpected error occurred while listing clients.', 500, 'server_error');
  }
}

// 确保 JWTUtils.verifyV2AuthAccessToken 存在
/*
declare module '@/lib/auth/oauth2' { ... }
*/
