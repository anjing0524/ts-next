import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { OAuth2ErrorCode } from '@repo/lib/node'; // For error types

const ADMIN_API_KEY = process.env.TOKEN_REVOCATION_ADMIN_KEY;

export async function POST(req: NextRequest) {
  // 1. Placeholder Protection
  if (!ADMIN_API_KEY || req.headers.get('X-Admin-API-Key') !== ADMIN_API_KEY) {
    return NextResponse.json(
      {
        error: OAuth2ErrorCode.UnauthorizedClient,
        error_description: 'Unauthorized: Missing or invalid admin API key.',
      },
      { status: 401 }
    );
  }

  // 2. Parse Request Body
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: OAuth2ErrorCode.InvalidRequest, error_description: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const { jti, exp, token_type: tokenType } = body;

  // 3. Validate Input
  if (!jti || typeof jti !== 'string') {
    return NextResponse.json(
      {
        error: OAuth2ErrorCode.InvalidRequest,
        error_description: 'Missing or invalid "jti" (JWT ID) in request body.',
      },
      { status: 400 }
    );
  }
  if (!exp || typeof exp !== 'number') {
    return NextResponse.json(
      {
        error: OAuth2ErrorCode.InvalidRequest,
        error_description: 'Missing or invalid "exp" (expiry timestamp) in request body.',
      },
      { status: 400 }
    );
  }

  const finalTokenType = tokenType === 'refresh' ? 'refresh' : 'access'; // Default to 'access'

  // Convert Unix timestamp (seconds) to JavaScript Date object for expiresAt
  const expiresAt = new Date(exp * 1000);
  if (isNaN(expiresAt.getTime())) {
    return NextResponse.json(
      {
        error: OAuth2ErrorCode.InvalidRequest,
        error_description: 'Invalid "exp" (expiry timestamp) format.',
      },
      { status: 400 }
    );
  }

  // 4. Create Blacklist Entry
  try {
    const existingEntry = await prisma.tokenBlacklist.findUnique({
      where: { jti },
    });

    if (existingEntry) {
      // JTI already blacklisted. Could return 200 or 204 as it's effectively revoked.
      // Or return a specific message. For now, a 200 with a note.
      return NextResponse.json(
        {
          message: 'JTI already blacklisted.',
          jti: existingEntry.jti,
          expiresAt: existingEntry.expiresAt,
        },
        { status: 200 } // Changed from 409 to 200 as per common practice for idempotent-like "already done"
      );
    }

    const newBlacklistEntry = await prisma.tokenBlacklist.create({
      data: {
        jti,
        tokenType: finalTokenType,
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        message: 'Token JTI successfully blacklisted.',
        jti: newBlacklistEntry.jti,
        tokenType: newBlacklistEntry.tokenType,
        expiresAt: newBlacklistEntry.expiresAt,
      },
      { status: 201 } // 201 Created
    );
  } catch (error: any) {
    // Prisma unique constraint violation (P2002) is handled by the findUnique check above.
    // This catch block is for other unexpected errors.
    console.error('Error blacklisting JTI:', error);
    let errorMessage = 'Failed to blacklist JTI due to an unexpected error.';
    if (error.code === 'P2002' && error.meta?.target?.includes('jti')) {
      // This case should ideally be caught by the findUnique check, but as a fallback:
      errorMessage = 'JTI is already blacklisted.';
      return NextResponse.json(
        { error: 'conflict', error_description: errorMessage, jti },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: OAuth2ErrorCode.ServerError, error_description: errorMessage },
      { status: 500 }
    );
  }
}
