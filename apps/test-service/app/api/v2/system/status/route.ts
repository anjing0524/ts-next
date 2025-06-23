// /api/v2/system/status
// 描述: 提供系统当前状态的概览信息。
// (Provides an overview of the current system status.)

import { NextResponse } from 'next/server';
import { requirePermission, AuthenticatedRequest } from '@/lib/auth/middleware';
import os from 'os'; // For uptime

/**
 * @swagger
 * /api/v2/system/status:
 *   get:
 *     summary: 获取系统当前状态 (系统状态管理)
 *     description: 检索系统当前运行状态、版本信息、以及是否处于维护模式等。需要 'system:status:read' 权限。
 *     tags: [System API - Status & Performance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取系统状态信息。
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [OPERATIONAL, MAINTENANCE, DEGRADED, UNKNOWN]
 *                   description: 系统当前运行状态。
 *                 version:
 *                   type: string
 *                   description: 应用版本号。
 *                 uptime:
 *                   type: number
 *                   description: 系统或应用正常运行时间（秒）。
 *                 maintenanceMode:
 *                   type: boolean
 *                   description: 系统是否处于维护模式。
 *                 message:
 *                   type: string
 *                   nullable: true
 *                   description: 额外的状态信息。
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: 未经授权。
 *       403:
 *         description: 禁止访问。
 */
async function getSystemStatusHandler(request: AuthenticatedRequest) {
  const performingAdmin = request.user;
  console.log(`Admin user ${performingAdmin?.id} requesting system status.`);

  // TODO: 从配置或实时状态服务获取真实数据
  // (TODO: Fetch real data from configuration or a live status service)
  const appVersion = process.env.APP_VERSION || '1.0.0-dev';
  const maintenanceMode = false; // Placeholder - should come from SystemConfiguration
  let systemStatus = "OPERATIONAL"; // Placeholder

  if (maintenanceMode) {
    systemStatus = "MAINTENANCE";
  }
  // Add other checks for 'DEGRADED' if necessary

  const statusResponse = {
    status: systemStatus,
    version: appVersion,
    uptime: Math.floor(process.uptime()), // Node.js process uptime in seconds
    maintenanceMode: maintenanceMode,
    message: "系统运行正常 (System is operating normally).", // Placeholder
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(statusResponse);
}

export const GET = requirePermission('system:status:read')(getSystemStatusHandler);
