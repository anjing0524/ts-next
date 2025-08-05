import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check database connection if available
    let dbStatus = 'disconnected';
    try {
      const { PrismaClient } = await import('@repo/database');
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      dbStatus = 'connected';
    } catch (error) {
      console.error('Database health check failed:', error);
      dbStatus = 'error';
    }

    // Check OAuth service
    let oauthStatus = 'unknown';
    try {
      const oauthUrl = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001';
      const response = await fetch(`${oauthUrl}/api/v2/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      oauthStatus = response.ok ? 'healthy' : 'unhealthy';
    } catch (error) {
      console.error('OAuth service health check failed:', error);
      oauthStatus = 'unreachable';
    }

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'admin-portal',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: dbStatus,
        oauth: oauthStatus,
      },
      uptime: process.uptime(),
    };

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 500 }
    );
  }
}