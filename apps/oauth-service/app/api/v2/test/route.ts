import { NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@repo/lib/node';

export async function GET() {
  try {
    return successResponse(
      { status: 'ok', timestamp: new Date().toISOString() },
      200,
      'Test endpoint working'
    );
  } catch (error) {
    console.error('Test endpoint error:', error);
    return errorResponse({
      message: error instanceof Error ? error.message : 'Unknown error',
      statusCode: 500,
      details: { timestamp: new Date().toISOString() },
    });
  }
} 