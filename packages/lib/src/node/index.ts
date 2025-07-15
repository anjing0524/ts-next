// Node环境专用统一索引，已包含 middleware 导出，供服务端使用
// 本文件统一导出认证、权限、服务、错误处理、中间件等核心能力
// middleware 相关内容已通过 export * from '../middleware' 导出
// 如需扩展请同步更新文档和 package.json 的 exports 字段
export * from '../auth';
export * from '../middleware';
export * from '../services';
export * from '../errors';
export { successResponse, errorResponse, generateRequestId } from '../apiResponse';
export { prisma } from '@repo/database';
export {
  OAuthConfig,
  DEFAULT_OAUTH_CONFIG,
  type OAuthClientConfig,
  type OAuthServiceConfig,
} from '../config/oauth-config';
export * from '../types';
export const LIB_VERSION = '1.0.0';
export { withErrorHandling } from '../utils/error-handler';
export { getUserDetails } from '../services/user-service';
export { excludePassword } from '../utils/misc';
// 时间轮工具相关导出，供 test-service 等服务端使用
export { default as TimeWheel, getTimeWheelInstance } from '../utils/time-wheel';
// 日志工具导出，供 test-service 等服务端使用
export { default as logger } from '../utils/logger'; 