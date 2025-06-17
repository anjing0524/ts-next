// app/api/v2/clients/[clientIdString]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import { OAuthClient, Prisma, ClientType } from '@prisma/client'; // Import Prisma types
import { z } from 'zod'; // Import Zod
import bcrypt from 'bcrypt'; // Import bcrypt for hashing secrets

// Helper function to format client for response (consistent with list endpoint)
// 格式化客户端响应数据，转换JSON字符串为数组，并排除密钥哈希
// (Formats client response data, converting JSON strings to arrays and excluding secret hash)
function formatClientForResponse(client: OAuthClient | Partial<OAuthClient> | null): Partial<OAuthClient> | null {
  if (!client) return null;
  const { clientSecret: _clientSecretHash, ...rest } = client as any;

  const output: Partial<OAuthClient> = { ...rest };
  const arrayFields: (keyof OAuthClient)[] = ['redirectUris', 'allowedScopes', 'grantTypes', 'responseTypes'];

  if (rest.ipWhitelist && typeof rest.ipWhitelist === 'string') {
    try { output.ipWhitelist = JSON.parse(rest.ipWhitelist); } catch (e) { output.ipWhitelist = null; } // Default to null if parsing fails
  } else if (Array.isArray(rest.ipWhitelist)) {
    output.ipWhitelist = rest.ipWhitelist;
  } else {
    output.ipWhitelist = null;
  }

  arrayFields.forEach(field => {
    const value = rest[field];
    if (value && typeof value === 'string') {
      try {
        output[field] = JSON.parse(value);
      } catch (e) {
        console.error(`Error parsing JSON string field '${String(field)}' for client ID ${client.id}:`, e);
        output[field] = [];
      }
    } else if (Array.isArray(value)) {
       output[field] = value;
    } else {
       output[field] = []; // Default to empty array if null/undefined or not an array
    }
  });
  return output;
}

// Zod schema for client PATCH updates
const clientPatchSchema = z.object({
  clientName: z.string().min(1, "客户端名称不能为空").max(100).optional(),
  clientDescription: z.string().max(500).optional().nullable(),
  clientSecret: z.string().min(8, "机密客户端密钥至少需要8个字符").max(100).optional(), // For setting/changing secret
  redirectUris: z.array(z.string().url("每个重定向URI都必须是有效的URL")).min(1, "至少需要一个重定向URI").optional(),
  allowedScopes: z.array(z.string().min(1)).optional(),
  grantTypes: z.array(z.string().min(1)).min(1, "至少需要一个授权类型").optional(),
  responseTypes: z.array(z.string().min(1)).optional(),
  accessTokenLifetime: z.number().int().positive().optional(),
  refreshTokenLifetime: z.number().int().positive().optional(),
  authorizationCodeLifetime: z.number().int().positive().optional(),
  requirePkce: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  logoUri: z.string().url().optional().nullable(),
  policyUri: z.string().url().optional().nullable(),
  tosUri: z.string().url().optional().nullable(),
  jwksUri: z.string().url().optional().nullable(), // Required if tokenEndpointAuthMethod is private_key_jwt
  tokenEndpointAuthMethod: z.enum(['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none']).optional(),
  ipWhitelist: z.array(z.string().min(1)).optional().nullable(),
  strictRedirectUriMatching: z.boolean().optional(),
  allowLocalhostRedirect: z.boolean().optional(),
  requireHttpsRedirect: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine(data => { // private_key_jwt 需要 jwksUri
  if (data.tokenEndpointAuthMethod === 'private_key_jwt' && !data.jwksUri) {
    return false;
  }
  return true;
}, {
  message: "jwksUri is required for tokenEndpointAuthMethod 'private_key_jwt' / private_key_jwt认证方法需要jwksUri",
  path: ["jwksUri"],
});


interface RouteContext {
  params: {
    clientIdString: string; // The string clientId, not the CUID primary key
  };
}

// --- GET /api/v2/clients/{clientIdString} (获取特定客户端详情) ---
async function getClientHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { clientIdString } = context.params;
  const performingAdmin = req.user;

  console.log(`Admin user ${performingAdmin?.id} attempting to retrieve client with clientIdString: ${clientIdString}.`);

  if (!clientIdString) {
    return NextResponse.json({ error: 'Bad Request', message: 'Client ID string is required.' }, { status: 400 });
  }

  try {
    const client = await prisma.oAuthClient.findUnique({
      where: { clientId: clientIdString }, // Fetch by the string clientId
    });

    if (!client) {
      return NextResponse.json({ error: 'Not Found', message: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(formatClientForResponse(client), { status: 200 });

  } catch (error: any) {
    console.error(`Error retrieving client ${clientIdString}:`, error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to retrieve client details.' }, { status: 500 });
  }
}
export const GET = requirePermission('clients:read')(getClientHandler);


// --- PATCH /api/v2/clients/{clientIdString} (部分更新特定客户端信息) ---
async function patchClientHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { clientIdString } = context.params;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} attempting to PATCH client with clientIdString: ${clientIdString}.`);

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body', message: 'Failed to parse JSON body.' }, { status: 400 });
  }

  // 禁止更改 clientId 和 clientType (Prevent changes to clientId and clientType)
  if (payload.clientId && payload.clientId !== clientIdString) {
    return NextResponse.json({ error: 'Bad Request', message: 'Client ID modification is not allowed.' }, { status: 400 });
  }
  if (payload.clientType) {
    return NextResponse.json({ error: 'Bad Request', message: 'Client type modification is not allowed.' }, { status: 400 });
  }

  const validationResult = clientPatchSchema.safeParse(payload);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Validation failed', issues: validationResult.error.issues }, { status: 400 });
  }

  const dataToUpdate = validationResult.data;
  let newPlainClientSecret: string | undefined = undefined;

  try {
    const existingClient = await prisma.oAuthClient.findUnique({ where: { clientId: clientIdString } });
    if (!existingClient) {
      return NextResponse.json({ error: 'Not Found', message: 'Client not found for update.' }, { status: 404 });
    }

    const prismaUpdateData: Prisma.OAuthClientUpdateInput = {};

    // Dynamically add fields to prismaUpdateData if they are present in validated data
    Object.keys(dataToUpdate).forEach(key => {
      const typedKey = key as keyof typeof dataToUpdate;
      if (typedKey !== 'clientSecret' && dataToUpdate[typedKey] !== undefined) {
        const value = dataToUpdate[typedKey];
        if (['redirectUris', 'allowedScopes', 'grantTypes', 'responseTypes', 'ipWhitelist'].includes(typedKey)) {
          prismaUpdateData[typedKey] = value === null ? Prisma.DbNull : JSON.stringify(value);
        } else {
          (prismaUpdateData as any)[typedKey] = value;
        }
      }
    });

    // Handle clientSecret update for CONFIDENTIAL clients
    if (dataToUpdate.clientSecret) {
      if (existingClient.clientType !== ClientType.CONFIDENTIAL) {
        return NextResponse.json({ error: 'Bad Request', message: 'Client secret can only be set for confidential clients.' }, { status: 400 });
      }
      if (existingClient.tokenEndpointAuthMethod === 'private_key_jwt' || existingClient.tokenEndpointAuthMethod === 'none') {
         return NextResponse.json({ error: 'Bad Request', message: `Client secret cannot be set for token endpoint auth method '${existingClient.tokenEndpointAuthMethod}'.` }, { status: 400 });
      }
      newPlainClientSecret = dataToUpdate.clientSecret;
      prismaUpdateData.clientSecret = await bcrypt.hash(newPlainClientSecret, 12);
    }

    if (Object.keys(prismaUpdateData).length === 0) {
        return NextResponse.json(formatClientForResponse(existingClient), { status: 200, headers: { "X-Message": "No fields to update or only immutable fields provided." } });
    }
    prismaUpdateData.updatedAt = new Date(); // Manually set updatedAt

    const updatedClient = await prisma.oAuthClient.update({
      where: { clientId: clientIdString },
      data: prismaUpdateData,
    });

    const responseData = formatClientForResponse(updatedClient);
    if (newPlainClientSecret) {
      (responseData as any).clientSecret = newPlainClientSecret; // Return new plain secret ONCE
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error(`Error updating client ${clientIdString}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // This could happen if an email/other unique field (not clientId) causes conflict.
      // For this specific PATCH, only other unique constraints would trigger this.
      return NextResponse.json({ error: 'Conflict', message: 'Update resulted in a conflict with existing data.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to update client.' }, { status: 500 });
  }
}
export const PATCH = requirePermission('clients:update')(patchClientHandler);


// --- DELETE /api/v2/clients/{clientIdString} (删除特定客户端) ---
async function deleteClientHandler(req: AuthenticatedRequest, context: RouteContext): Promise<NextResponse> {
  const { clientIdString } = context.params;
  const performingAdmin = req.user;
  console.log(`Admin user ${performingAdmin?.id} attempting to DELETE client with clientIdString: ${clientIdString}.`);

  if (!clientIdString) {
    return NextResponse.json({ error: 'Bad Request', message: 'Client ID string is required.' }, { status: 400 });
  }

  try {
    const clientToDelete = await prisma.oAuthClient.findUnique({ where: { clientId: clientIdString } });
    if (!clientToDelete) {
      return NextResponse.json({ error: 'Not Found', message: 'Client not found for deletion.' }, { status: 404 });
    }

    // Perform deletion
    // Note: Prisma's behavior on delete (cascade, restrict) depends on schema definitions.
    // Assuming relations are set up to handle cascades or prevent deletion if referenced.
    await prisma.oAuthClient.delete({ where: { clientId: clientIdString } });

    return new NextResponse(null, { status: 204 }); // 204 No Content for successful deletion

  } catch (error: any) {
    console.error(`Error deleting client ${clientIdString}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // Record to delete not found
        return NextResponse.json({ error: 'Not Found', message: 'Client not found for deletion (P2025).' }, { status: 404 });
      }
      if (error.code === 'P2003') { // Foreign key constraint failed
         return NextResponse.json({ error: 'Conflict', message: 'Client cannot be deleted, it is still referenced by other records.' }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to delete client.' }, { status: 500 });
  }
}
export const DELETE = requirePermission('clients:delete')(deleteClientHandler);
