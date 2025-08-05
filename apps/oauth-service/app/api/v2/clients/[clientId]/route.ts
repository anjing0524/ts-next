import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ClientService } from '@/lib/auth/services/client-service';
import { successResponse, errorResponse } from '@repo/lib/node';

const updateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  redirectUris: z.array(z.string().url()).min(1).optional(),
  allowedScopes: z.array(z.string()).min(1).optional(),
  logoUri: z.string().url().optional(),
  policyUri: z.string().url().optional(),
  tosUri: z.string().url().optional(),
  requireConsent: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
  accessTokenTtl: z.number().int().positive().optional(),
  refreshTokenTtl: z.number().int().positive().optional(),
  authorizationCodeLifetime: z.number().int().positive().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  const { clientId } = await params;
  try {
    const client = await ClientService.getClientById(clientId);
    if (!client) {
      return errorResponse({ message: '客户端未找到', statusCode: 404 });
    }
    return successResponse(client);
  } catch (error) {
    console.error(`获取客户端 ${clientId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  const { clientId } = await params;
  try {
    const headersList = await headers();
    const body = await req.json();
    const validationResult = updateClientSchema.safeParse(body);

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

    const updatedClient = await ClientService.updateClient(
      clientId,
      validationResult.data,
      auditInfo
    );
    return successResponse(updatedClient);
  } catch (error) {
    console.error(`更新客户端 ${clientId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  const { clientId } = await params;
  try {
    const headersList = await headers();
    const auditInfo = {
      userId: headersList.get('X-User-Id') || undefined,
      ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    };

    await ClientService.deleteClient(clientId, auditInfo);
    return successResponse(null, 204);
  } catch (error) {
    console.error(`删除客户端 ${clientId} 失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
