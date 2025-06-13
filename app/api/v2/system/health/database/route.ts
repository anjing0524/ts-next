// /api/v2/system/health/database

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/v2/system/health/database:
 *   get:
 *     summary: 检查数据库连接健康状况 (系统健康检查)
 *     description: 专门用于测试和报告数据库连接的状态。
 *     tags: [System API - Health Check]
 *     responses:
 *       200:
 *         description: 数据库连接正常。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *                 message:
 *                   type: string
 *                   example: "Database connection successful."
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: 数据库连接失败。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [error]
 *                 message:
 *                   type: string
 *                   example: "Failed to connect to the database."
 *                 details:
 *                   type: string
 *                   nullable: true # Error details
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
export async function GET(request: Request) {
  // TODO: 实现数据库连接健康检查逻辑 (Implement database connection health check logic)
  // 1. 尝试执行一个简单的数据库查询 (e.g., `SELECT 1` or `prisma.$queryRaw` or `prisma.$connect`).
  // 2. 如果成功，返回 200 OK。
  // 3. 如果失败，返回 503 Service Unavailable。
  console.log('GET /api/v2/system/health/database request');
  try {
    await prisma.$queryRaw`SELECT 1`; // Basic query to check connection
    // await prisma.$connect(); // Alternative: ensure client can connect. More involved if already connected.
    return NextResponse.json({
      status: 'ok',
      message: 'Database connection successful.',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Database health check failed:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to connect to the database.',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  } finally {
    // $disconnect is not strictly necessary for a health check if Prisma client is managed globally,
    // but if you create a client per request for this, then it's good practice.
    // await prisma.$disconnect();
  }
}
