import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ClientType } from '@prisma/client';
import { ClientService } from '@/lib/services/client-service';
import { successResponse, errorResponse } from '@repo/lib/node';

const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  clientType: z.nativeEnum(ClientType),
  redirectUris: z.array(z.string().url()).min(1),
  grantTypes: z.array(z.string()).min(1),
  responseTypes: z.array(z.string()).min(1),
  allowedScopes: z.array(z.string()).min(1),
  logoUri: z.string().url().optional(),
  policyUri: z.string().url().optional(),
  tosUri: z.string().url().optional(),
  requirePkce: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
  accessTokenTtl: z.number().int().positive().optional(),
  refreshTokenTtl: z.number().int().positive().optional(),
  authorizationCodeLifetime: z.number().int().positive().optional(),
});

const queryClientsSchema = z.object({
  clientType: z.nativeEnum(ClientType).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  name: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100))
    .optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0))
    .optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const validationResult = queryClientsSchema.safeParse(queryParams);

    if (!validationResult.success) {
      return errorResponse({
        message: '请求参数验证失败',
        statusCode: 400,
        details: validationResult.error.flatten().fieldErrors,
      });
    }

    const result = await ClientService.getClients(validationResult.data);
    return successResponse(result);
  } catch (error) {
    console.error('获取客户端列表失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const headersList = await headers();
    const body = await request.json();
    const validationResult = createClientSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse({
        message: '请求数据验证失败',
        statusCode: 400,
        details: validationResult.error.flatten().fieldErrors,
      });
    }

    const auditInfo = {
      userId: headersList.get('X-User-Id') || undefined,
      ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    };

    const client = await ClientService.createClient(validationResult.data, auditInfo);
    return successResponse(client, 201);
  } catch (error) {
    console.error('创建客户端失败:', error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
