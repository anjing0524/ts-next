import { NextResponse } from 'next/server';

import { checkPoolHealth } from '@/lib/instance/mysql-client';
import logger from '@/utils/logger';

export async function GET() {
  try {
    logger.info('Health check endpoint called');
    
    // Check database connection
    const dbHealth = await checkPoolHealth();
    logger.info(`Database health check result: ${dbHealth}`);
    
    if (!dbHealth) {
      logger.error('Database health check failed');
      return NextResponse.json(
        { status: 'error', message: 'Database connection failed' },
        { status: 503 }
      );
    }

    logger.info('Health check successful');
    return NextResponse.json(
      { status: 'ok', message: 'Service is healthy' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Health check failed:', error);
    return NextResponse.json(
      { status: 'error', message: 'Health check failed' },
      { status: 500 }
    );
  }
} 