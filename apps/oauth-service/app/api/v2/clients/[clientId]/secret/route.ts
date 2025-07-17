import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { ClientService } from '@/lib/services/client-service';
import { successResponse, errorResponse } from '@repo/lib/node';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
): Promise<NextResponse> {
  try {
    const { clientId } = await params;
    const headersList = await headers();
    const auditInfo = {
      userId: headersList.get('X-User-Id') || undefined,
      ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown',
      userAgent: headersList.get('user-agent') || 'unknown',
    };

    const newSecret = await ClientService.rotateClientSecret(clientId, auditInfo);

    return successResponse({
      newSecret: newSecret,
      message: '客户端密钥重置成功。请立即保存新的密钥，它将不会再次显示。',
    });
  } catch (error) {
    console.error(`重置客户端密钥失败:`, error);
    return errorResponse({ message: '服务器内部错误' });
  }
}
