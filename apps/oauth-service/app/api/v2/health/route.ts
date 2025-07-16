import { NextRequest, NextResponse } from 'next/server';

/**
 * 健康检查API，返回服务状态
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'ok' });
}
