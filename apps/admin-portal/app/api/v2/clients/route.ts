// app/api/v2/clients/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/middleware';
import { AuthorizationUtils } from '@/lib/auth/oauth2'; // For Audit Logging
import { ClientType, OAuthClient, Prisma } from '@prisma/client';

// --- Zod Schemas for Validation ---
const clientCreateSchema = z.object({
  clientId: z.string().min(3, "clientId must be at least 3 characters long / 客户端ID至少需要3个字符").max(100, "clientId must be at most 100 characters long / 客户端ID长度不超过100").optional(),
  clientName: z.string().min(1, "clientName is required / 客户端名称不能为空").max(100, "clientName must be at most 100 characters long / 客户端名称长度不超过100"),
  clientDescription: z.string().max(500, "clientDescription must be at most 500 characters long / 客户端描述长度不超过500").optional().nullable(),
  clientType: z.enum([ClientType.PUBLIC, ClientType.CONFIDENTIAL], {
    errorMap: () => ({ message: "clientType must be PUBLIC or CONFIDENTIAL / 客户端类型必须是 PUBLIC 或 CONFIDENTIAL" })
  }),
  clientSecret: z.string().min(8, "clientSecret must be at least 8 characters long for confidential clients / 机密客户端密钥至少需要8个字符").max(100).optional(),
  redirectUris: z.array(z.string().url("Each redirectUri must be a valid URL / 每个重定向URI都必须是有效的URL")).min(1, "At least one redirectUri is required / 至少需要一个重定向URI"),
  allowedScopes: z.array(z.string().min(1)).default([]),
  grantTypes: z.array(z.string().min(1)).min(1, "At least one grantType is required / 至少需要一个授权类型"),
  responseTypes: z.array(z.string().min(1)).default(['code']), // Default to ['code'] if not provided
  accessTokenLifetime: z.number().int().positive("Access token lifetime must be a positive integer / 访问令牌生命周期必须是正整数").optional(),
  refreshTokenLifetime: z.number().int().positive("Refresh token lifetime must be a positive integer / 刷新令牌生命周期必须是正整数").optional(),
  authorizationCodeLifetime: z.number().int().positive("Authorization code lifetime must be a positive integer / 授权码生命周期必须是正整数").optional(),
  requirePkce: z.boolean().default(true).optional(),
  requireConsent: z.boolean().default(true).optional(),
  logoUri: z.string().url("logoUri must be a valid URL / logoUri必须是有效的URL").optional().nullable(),
  policyUri: z.string().url("policyUri must be a valid URL / policyUri必须是有效的URL").optional().nullable(),
  tosUri: z.string().url("tosUri must be a valid URL / tosUri必须是有效的URL").optional().nullable(),
  jwksUri: z.string().url("jwksUri must be a valid URL for private_key_jwt clients / jwksUri必须是有效的URL (用于private_key_jwt)").optional().nullable(),
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none']).default('client_secret_basic').optional(),
  ipWhitelist: z.array(z.string().min(1)).optional().nullable(), // Array of IPs/CIDRs
  strictRedirectUriMatching: z.boolean().default(true).optional(),
  allowLocalhostRedirect: z.boolean().default(false).optional(),
  requireHttpsRedirect: z.boolean().default(true).optional(),
  isActive: z.boolean().default(true).optional(),
}).refine(data => { // 如果是机密客户端且认证方法不是 none，则 clientSecret 是必需的 (除非是 private_key_jwt)
  if (data.clientType === ClientType.CONFIDENTIAL &&
      data.tokenEndpointAuthMethod !== 'none' &&
      data.tokenEndpointAuthMethod !== 'private_key_jwt' &&
      !data.clientSecret) {
    return false;
  }
  return true;
}, {
  message: "clientSecret is required for confidential clients using secret-based authentication / 对于使用密钥认证的机密客户端，clientSecret是必需的",
  path: ["clientSecret"],
}).refine(data => { // private_key_jwt 需要 jwksUri
  if (data.tokenEndpointAuthMethod === 'private_key_jwt' && !data.jwksUri) {
    return false;
  }
  return true;
}, {
  message: "jwksUri is required for tokenEndpointAuthMethod 'private_key_jwt' / private_key_jwt认证方法需要jwksUri",
  path: ["jwksUri"],
}).refine(data => { // public client auth method
  if (data.clientType === ClientType.PUBLIC && data.tokenEndpointAuthMethod !== 'none') {
    return false;
  }
  return true;
}, {
  message: "Public clients must use 'none' as tokenEndpointAuthMethod / 公共客户端必须使用 'none' 作为认证方法",
  path: ["tokenEndpointAuthMethod"],
});


// --- Helper Functions ---
function generateRandomClientId(prefix: string = "client_"): string {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

function generateRandomClientSecret(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 chars long
}

// 格式化客户端响应数据，转换JSON字符串为数组，并排除密钥哈希
// (Formats client response data, converting JSON strings to arrays and excluding secret hash)
function formatClientForResponse(client: OAuthClient | Partial<OAuthClient>): Partial<OAuthClient> {
  const { clientSecret: _clientSecretHash, ...rest } = client as any; // _clientSecretHash is the hashed one from DB

  const output: Partial<OAuthClient> = { ...rest };
  const arrayFields: (keyof OAuthClient)[] = ['redirectUris', 'allowedScopes', 'grantTypes', 'responseTypes'];
  // ipWhitelist is also an array but stored as JSON string
  if (rest.ipWhitelist && typeof rest.ipWhitelist === 'string') {
    try { output.ipWhitelist = JSON.parse(rest.ipWhitelist); } catch (e) { output.ipWhitelist = []; }
  } else if (Array.isArray(rest.ipWhitelist)) {
    output.ipWhitelist = rest.ipWhitelist; // Already an array
  } else {
    output.ipWhitelist = null; // Or undefined, depending on desired output
  }


  arrayFields.forEach(field => {
    const value = rest[field];
    if (value && typeof value === 'string') {
      try {
        output[field] = JSON.parse(value);
      } catch (e) {
        console.error(`Error parsing JSON string field '${String(field)}' for client ID ${client.id}:`, e);
        output[field] = []; // Default to empty array on parse error
      }
    } else if (Array.isArray(value)) {
       output[field] = value; // Already an array
    } else {
       output[field] = []; // Default to empty array if null/undefined
    }
  });
  return output;
}


// --- POST /api/v2/clients (创建新客户端) ---
async function createClientHandler(req: NextRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  const ipAddress = req.ip || req.headers?.get('x-forwarded-for');
  const userAgent = req.headers?.get('user-agent');
  console.log(`Admin user ${performingAdmin?.id} attempting to create a new client.`);

  let payload;
  try {
    payload = await req.json();
  } catch (error: any) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'CLIENT_CREATE_FAILURE_INVALID_JSON',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid JSON request body for client creation.',
        details: JSON.stringify({ error: error.message }),
    });
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  const validationResult = clientCreateSchema.safeParse(payload);
  if (!validationResult.success) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'CLIENT_CREATE_FAILURE_VALIDATION',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Client creation payload validation failed.',
        details: JSON.stringify({ issues: validationResult.error.issues, receivedBody: payload }),
    });
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const data = validationResult.data;

  // Client ID logic
  const finalClientId = data.clientId || generateRandomClientId();
  const existingClientById = await prisma.oAuthClient.findUnique({ where: { clientId: finalClientId } });
  if (existingClientById) {
    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'CLIENT_CREATE_FAILURE_ID_CONFLICT',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Client ID already exists.',
        details: JSON.stringify({ clientId: finalClientId }),
    });
    return NextResponse.json({ error: 'Conflict', message: 'Client ID already exists.' }, { status: 409 });
  }

  // Client Secret logic
  let clientSecretHashed: string | null = null;
  let plainTextSecret: string | undefined = data.clientSecret; // User-provided secret

  if (data.clientType === ClientType.CONFIDENTIAL) {
    if (data.tokenEndpointAuthMethod === 'client_secret_basic' || data.tokenEndpointAuthMethod === 'client_secret_post') {
      if (!plainTextSecret) { // If no secret provided by admin for a type that needs one, generate it
        plainTextSecret = generateRandomClientSecret();
      }
      clientSecretHashed = await bcrypt.hash(plainTextSecret, 12);
    } else if (data.tokenEndpointAuthMethod === 'private_key_jwt') {
      // No client secret stored for private_key_jwt
      plainTextSecret = undefined; // Ensure no plain secret is returned
    }
    // 'none' for confidential client is not typical but possible if other mechanisms secure it.
    // Zod schema already checks if 'none' is used for confidential, clientSecret is not required.
  } else { // Public client
      plainTextSecret = undefined; // Public clients never have a secret returned
  }


  try {
    const newClientData: Prisma.OAuthClientCreateInput = {
      clientId: finalClientId,
      name: data.clientName,
      description: data.clientDescription,
      clientSecret: clientSecretHashed,
      clientType: data.clientType,
      redirectUris: JSON.stringify(data.redirectUris),
      allowedScopes: JSON.stringify(data.allowedScopes || []),
      grantTypes: JSON.stringify(data.grantTypes),
      responseTypes: JSON.stringify(data.responseTypes || []),
      accessTokenTtl: data.accessTokenLifetime,
      refreshTokenTtl: data.refreshTokenLifetime,
      authorizationCodeLifetime: data.authorizationCodeLifetime,
      requirePkce: data.clientType === ClientType.PUBLIC ? true : (data.requirePkce ?? true), // PKCE must be true for public, optional for confidential (defaults to true)
      requireConsent: data.requireConsent,
      logoUri: data.logoUri,
      policyUri: data.policyUri,
      tosUri: data.tosUri,
      jwksUri: data.jwksUri,
      tokenEndpointAuthMethod: data.tokenEndpointAuthMethod,
      ipWhitelist: data.ipWhitelist ? JSON.stringify(data.ipWhitelist) : null,
      strictRedirectUriMatching: data.strictRedirectUriMatching,
      allowLocalhostRedirect: data.allowLocalhostRedirect,
      requireHttpsRedirect: data.requireHttpsRedirect,
      isActive: data.isActive,
      // createdBy: performingAdmin?.id, // Add if your OAuthClient model supports this
    };

    const newClient = await prisma.oAuthClient.create({ data: newClientData });

    const responseClientData = formatClientForResponse(newClient);
    if (plainTextSecret && data.clientType === ClientType.CONFIDENTIAL && (data.tokenEndpointAuthMethod === 'client_secret_basic' || data.tokenEndpointAuthMethod === 'client_secret_post')) {
      (responseClientData as any).clientSecret = plainTextSecret; // Return plain text secret ONLY on creation
    }

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: 'CLIENT_CREATE_SUCCESS',
        status: 'SUCCESS',
        resourceType: 'OAuthClient',
        resourceId: newClient.id,
        ipAddress,
        userAgent,
        details: JSON.stringify({
            clientId: newClient.clientId,
            clientName: newClient.name,
            clientType: newClient.clientType,
        }),
    });
    return NextResponse.json(responseClientData, { status: 201 });

  } catch (error: any) {
    console.error('Client creation failed:', error);
    let errorMessage = 'Failed to create client.';
    let actionCode = 'CLIENT_CREATE_FAILURE_DB_ERROR';
    let details = { error: error.message, errorCode: (error as any).code, clientData: data };

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || ['field'];
      errorMessage = `A client with the same ${target.join(', ')} already exists.`;
      actionCode = 'CLIENT_CREATE_FAILURE_DB_CONFLICT';
      details = { ...details, conflictTarget: target };
    }

    await AuthorizationUtils.logAuditEvent({
        actorType: performingAdmin?.id ? 'USER' : 'UNKNOWN_ACTOR',
        actorId: performingAdmin?.id || 'anonymous',
        userId: performingAdmin?.id,
        action: actionCode,
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: errorMessage,
        details: JSON.stringify(details),
    });

    if (actionCode === 'CLIENT_CREATE_FAILURE_DB_CONFLICT') {
      return NextResponse.json({ error: 'Conflict', message: errorMessage }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to create client.' }, { status: 500 });
  }
}
export const POST = requirePermission('clients:create')(createClientHandler);


// --- GET /api/v2/clients (列出所有客户端) ---
const DEFAULT_PAGE_SIZE_CLIENTS = 10;
const MAX_PAGE_SIZE_CLIENTS = 50;

async function listClientsHandler(req: NextRequest): Promise<NextResponse> {
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} listing clients.`);

  const { searchParams } = new URL(req.url); // Correct way to get searchParams from NextRequest
  const page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE_CLIENTS.toString(), 10);
  if (pageSize <= 0) pageSize = DEFAULT_PAGE_SIZE_CLIENTS;
  if (pageSize > MAX_PAGE_SIZE_CLIENTS) pageSize = MAX_PAGE_SIZE_CLIENTS;

  const clientNameQuery = searchParams.get('clientName');
  const clientIdQuery = searchParams.get('clientId');
  const clientTypeQuery = searchParams.get('clientType') as ClientType | null;

  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrderInput = searchParams.get('sortOrder') || 'desc';
  const sortOrder = (sortOrderInput.toLowerCase() === 'asc' || sortOrderInput.toLowerCase() === 'desc') ? sortOrderInput.toLowerCase() as Prisma.SortOrder : 'desc';

  const where: Prisma.OAuthClientWhereInput = {};
  if (clientNameQuery) where.name = { contains: clientNameQuery, mode: 'insensitive' };
  if (clientIdQuery) where.clientId = { contains: clientIdQuery, mode: 'insensitive' }; // clientId is unique, but allow partial search by admin
  if (clientTypeQuery && Object.values(ClientType).includes(clientTypeQuery)) {
    where.clientType = clientTypeQuery;
  }

  const validSortByFields: (keyof OAuthClient)[] = ['name', 'clientId', 'clientType', 'createdAt', 'updatedAt', 'isActive'];
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
      clients: clients.map(formatClientForResponse),
      total: totalClients,
      page,
      pageSize,
      totalPages: Math.ceil(totalClients / pageSize),
    }, { status: 200 });

  } catch (error) {
    console.error('Failed to list clients:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to retrieve clients.' }, { status: 500 });
  }
}
export const GET = requirePermission('clients:list')(listClientsHandler);

// Note: The `isUserAdmin` and `isValidHttpUrl` from the original file were removed as auth is now handled by `requirePermission`
// and URL validation is handled by Zod.
// The JWTUtils.verifyV2AuthAccessToken was specific to an older auth mechanism and is replaced by the Bearer token validation in `requirePermission`.
