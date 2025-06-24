import os from 'os'; // For os related info
import process from 'process'; // For process related info

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/middleware'; // Updated import
// import { successResponse } from '@/lib/api/apiResponse'; // Assuming direct response now
// import { withErrorHandler } from '@/lib/api/errorHandler'; // Assuming requirePermission handles errors


async function getSystemMetricsHandler(request: NextRequest) { // Changed to AuthenticatedRequest
  // const requestId = (request as { requestId?: string }).requestId; // Not directly available with requirePermission HOF

  // Calculate memory usage, ensuring values are numbers before toFixed
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();

  const rssBytes = process.memoryUsage().rss;
  const heapTotalBytes = process.memoryUsage().heapTotal;
  const heapUsedBytes = process.memoryUsage().heapUsed;
  const externalBytes = process.memoryUsage().external;
  // const arrayBuffersBytes = process.memoryUsage().arrayBuffers; // arrayBuffers might not exist on all Node versions or be 0

  const metrics = {
    timestamp: new Date().toISOString(),
    nodejsVersion: process.version,
    platform: os.platform(),
    osType: os.type(), // e.g., 'Linux', 'Darwin', 'Windows_NT'
    osRelease: os.release(), // Kernel release
    architecture: os.arch(), // e.g., 'x64', 'arm64'
    cpuCores: os.cpus().length,
    // Convert bytes to MB and format to 2 decimal places
    totalMemoryMB: (totalMemBytes / (1024 * 1024)).toFixed(2),
    freeMemoryMB: (freeMemBytes / (1024 * 1024)).toFixed(2),
    usedMemoryMB: ((totalMemBytes - freeMemBytes) / (1024 * 1024)).toFixed(2),
    uptimeSeconds: Math.floor(process.uptime()), // System uptime in seconds
    processMemoryUsage: {
      // Renamed from memoryUsage to be more specific
      rssMB: (rssBytes / (1024 * 1024)).toFixed(2),
      heapTotalMB: (heapTotalBytes / (1024 * 1024)).toFixed(2),
      heapUsedMB: (heapUsedBytes / (1024 * 1024)).toFixed(2),
      externalMB: (externalBytes / (1024 * 1024)).toFixed(2),
      // arrayBuffersMB: arrayBuffersBytes ? (arrayBuffersBytes / (1024 * 1024)).toFixed(2) : '0.00', // Handle if arrayBuffers is undefined/zero
    },
    loadAverage: os.loadavg(), // System load average [1min, 5min, 15min]. May not be available on all platforms (e.g. Windows)
    // message: "For detailed, time-series metrics, please refer to the dedicated monitoring system (e.g., Prometheus/Grafana)."
  };

  // Handle arrayBuffers specifically as it might not be present in all Node.js versions
  if (typeof process.memoryUsage().arrayBuffers === 'number') {
    (
      metrics.processMemoryUsage as typeof metrics.processMemoryUsage & { arrayBuffersMB?: string }
    ).arrayBuffersMB = (process.memoryUsage().arrayBuffers / (1024 * 1024)).toFixed(2);
  }

  return NextResponse.json(metrics); // Direct response
}

// Updated to use requirePermission HOF
export const GET = requirePermission('system:metrics:read')(getSystemMetricsHandler);
