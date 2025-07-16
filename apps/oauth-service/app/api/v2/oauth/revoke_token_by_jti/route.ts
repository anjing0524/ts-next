import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { OAuth2ErrorCode } from '@repo/lib/node'; // For error types
import { successResponse, errorResponse } from '@repo/lib/node';

const ADMIN_API_KEY = process.env.TOKEN_REVOCATION_ADMIN_KEY;

export async function POST(req: NextRequest) {
  // 1. Placeholder Protection
  if (!ADMIN_API_KEY || req.headers.get('X-Admin-API-Key') !== ADMIN_API_KEY) {
    return errorResponse({
      message: '未授权：缺少或无效的admin API key',
      statusCode: 401,
      details: { code: 'unauthorized' },
    });
  }

  // 2. Parse Request Body
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse({
      message: '无效的JSON请求体',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }

  const { jti, exp, token_type: tokenType } = body;

  // 3. Validate Input
  if (!jti || typeof jti !== 'string') {
    return errorResponse({
      message: '缺少或无效的jti (JWT ID)',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }
  if (!exp || typeof exp !== 'number') {
    return errorResponse({
      message: '缺少或无效的exp (过期时间戳)',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }

  const finalTokenType = tokenType === 'refresh' ? 'refresh' : 'access'; // Default to 'access'

  // Convert Unix timestamp (seconds) to JavaScript Date object for expiresAt
  const expiresAt = new Date(exp * 1000);
  if (isNaN(expiresAt.getTime())) {
    return errorResponse({
      message: '无效的exp (过期时间戳)格式',
      statusCode: 400,
      details: { code: 'invalid_request' },
    });
  }

  // 4. Create Blacklist Entry
  try {
    const existingEntry = await prisma.tokenBlacklist.findUnique({
      where: { jti },
    });

    if (existingEntry) {
      // JTI already blacklisted. Could return 200 or 204 as it's effectively revoked.
      // Or return a specific message. For now, a 200 with a note.
      return successResponse({
        message: 'JTI已在黑名单',
        jti: existingEntry.jti,
        expiresAt: existingEntry.expiresAt,
      }, 200, 'JTI已在黑名单');
    }

    const newBlacklistEntry = await prisma.tokenBlacklist.create({
      data: {
        jti,
        tokenType: finalTokenType,
        expiresAt,
      },
    });

    return successResponse({
      message: 'Token JTI成功加入黑名单',
      jti: newBlacklistEntry.jti,
      tokenType: newBlacklistEntry.tokenType,
      expiresAt: newBlacklistEntry.expiresAt,
    }, 201, 'JTI黑名单添加成功');
  } catch (error: any) {
    // Prisma unique constraint violation (P2002) is handled by the findUnique check above.
    // This catch block is for other unexpected errors.
    console.error('Error blacklisting JTI:', error);
    let errorMessage = 'Failed to blacklist JTI due to an unexpected error.';
    if (error.code === 'P2002' && error.meta?.target?.includes('jti')) {
      // This case should ideally be caught by the findUnique check, but as a fallback:
      errorMessage = 'JTI已在黑名单';
      return errorResponse({
        message: 'JTI已在黑名单',
        statusCode: 409,
        details: { jti },
      });
    }
    return errorResponse({
      message: '黑名单操作失败',
      statusCode: 500,
      details: { code: 'server_error' },
    });
  }
}
