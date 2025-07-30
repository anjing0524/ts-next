import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { redis } from '@repo/cache';

/**
 * Enhanced Health Check API
 * Comprehensive health check with database and Redis connectivity
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const healthStatus = {
    status: 'healthy',
    services: {
      database: 'unknown',
      redis: 'unknown',
      api: 'healthy',
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    response_time: {
      total: 0,
      database: 0,
      redis: 0,
    },
    versions: {
      node: process.version,
      api: process.env.npm_package_version || '1.0.0',
    },
    metrics: {
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100),
      },
      cpu: {
        usage: 0, // Would need actual CPU monitoring
      },
    },
    degraded: false,
  };

  try {
    // Check Database connectivity
    const dbStartTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    healthStatus.services.database = 'healthy';
    healthStatus.response_time.database = Date.now() - dbStartTime;

    // Get database version
    const dbVersion = await prisma.$queryRaw`SELECT version()`;
    healthStatus.versions.database = (dbVersion as any)[0]?.version?.split(' ')[0] || 'PostgreSQL';

    // Check Redis connectivity
    const redisStartTime = Date.now();
    const redisResponse = await redis.ping();
    if (redisResponse === 'PONG') {
      healthStatus.services.redis = 'healthy';
    } else {
      healthStatus.services.redis = 'unhealthy';
    }
    healthStatus.response_time.redis = Date.now() - redisStartTime;

    // Get Redis version
    try {
      const redisInfo = await redis.info('server');
      const versionMatch = redisInfo.match(/redis_version:(\d+\.\d+\.\d+)/);
      healthStatus.versions.redis = versionMatch ? `Redis ${versionMatch[1]}` : 'Redis';
    } catch {
      healthStatus.versions.redis = 'Redis';
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('database')) {
        healthStatus.services.database = 'unhealthy';
      }
      if (error.message.includes('redis')) {
        healthStatus.services.redis = 'unhealthy';
      }
    }

    // Determine overall status
    const unhealthyServices = Object.values(healthStatus.services).filter(status => status === 'unhealthy').length;
    
    if (unhealthyServices === Object.keys(healthStatus.services).length - 1) { // Exclude API
      healthStatus.status = 'unhealthy';
    } else if (unhealthyServices > 0) {
      healthStatus.status = 'degraded';
    }

    healthStatus.degraded = unhealthyServices > 0;
  }

  // Calculate total response time
  healthStatus.response_time.total = Date.now() - startTime;

  // Determine HTTP status code
  const httpStatus = healthStatus.status === 'unhealthy' ? 503 : 200;
  const message = healthStatus.status === 'healthy' 
    ? 'Health check successful' 
    : healthStatus.status === 'degraded' 
    ? 'Health check completed with issues' 
    : 'Service unavailable';

  return NextResponse.json(healthStatus, { status: httpStatus });
}
