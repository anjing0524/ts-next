import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils } from '../auth';
import { AppError } from '../errors';

export function requirePermission(permission: string) {
  return async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError({
        statusCode: 401,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }
    const token = authHeader.substring(7);
    const { valid, payload } = await JWTUtils.verifyToken(token);
    if (!valid || !payload) {
      throw new AppError({
        statusCode: 401,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }
    if (!payload.permissions?.includes(permission)) {
      throw new AppError({
        statusCode: 403,
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }
    return NextResponse.next();
  };
}
