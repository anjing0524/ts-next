// /api/v2/system/performance
// 描述: 提供系统性能指标的概览。
// (Provides an overview of system performance metrics.)

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware';
import os from 'os'; // For load average
import process from 'process'; // For memory usage and uptime

/**
 * @swagger
 * /api/v2/system/performance:
 *   get:
 *     summary: 获取系统性能指标 (系统状态管理)
 *     description: 检索系统当前的性能指标，例如CPU负载、内存使用率、请求吞吐量等。需要 'system:performance:read' 权限。
 *     tags: [System API - Status & Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取系统性能指标。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cpuLoad:
 *                   type: array
 *                   items: { type: number }
 *                   description: CPU平均负载 (1, 5, 15分钟)。
 *                 memoryUsage:
 *                   type: object
 *                   properties:
 *                     processRssMB: { type: number, description: "进程常驻内存大小 (MB)" }
 *                     processHeapUsedMB: { type: number, description: "进程堆已用大小 (MB)" }
 *                     systemFreeMemoryMB: { type: number, description: "系统空闲内存 (MB)" }
 *                     systemTotalMemoryMB: { type: number, description: "系统总内存 (MB)" }
 *                 uptimeSeconds:
 *                   type: number
 *                   description: 应用进程正常运行时间（秒）。
 *                 activeHandles:
 *                   type: integer
 *                   description: Node.js 事件循环中的活动句柄数。
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 */
async function getSystemPerformanceHandler(request: NextRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting system performance metrics.`);

  // TODO: 集成更详细或真实的性能监控数据源
  // (TODO: Integrate more detailed or real performance monitoring data sources)

  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();

  const performanceData = {
    cpuLoad: os.loadavg(), // [1min, 5min, 15min] load averages
    memoryUsage: {
      processRssMB: parseFloat((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
      processHeapUsedMB: parseFloat((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)),
      processHeapTotalMB: parseFloat((process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2)),
      systemFreeMemoryMB: parseFloat((freeMemBytes / (1024 * 1024)).toFixed(2)),
      systemTotalMemoryMB: parseFloat((totalMemBytes / (1024 * 1024)).toFixed(2)),
      systemUsedMemoryMB: parseFloat(((totalMemBytes - freeMemBytes) / (1024 * 1024)).toFixed(2)),
    },
    uptimeSeconds: Math.floor(process.uptime()),
    activeHandles: (process as any)._getActiveHandles ? (process as any)._getActiveHandles().length : -1, // Node.js specific, may not be universally available or stable
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(performanceData);
}

export const GET = requirePermission('system:performance:read')(getSystemPerformanceHandler);
